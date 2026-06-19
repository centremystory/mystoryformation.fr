/**
 * MYSTORY — /api/examens/ventes-groupe  (Sens A1 : inscription CROISÉE / panier)
 * POST — inscrit un candidat à PLUSIEURS examens en une seule action.
 *   1) Candidat créé/retrouvé par email (une seule fiche).
 *   2) PRÉ-CONTRÔLE GLOBAL (rien créé) : places + carences de chaque examen
 *      + règle « pas 2 mentions civiques différentes le même jour » À L'INTÉRIEUR du panier.
 *      Si une seule règle bloque → 409, RIEN n'est créé (sauf override Direction + motif).
 *   3) Création de chaque inscription (insert → attestation+convocation → email → facture),
 *      en réutilisant les helpers du flux mono. Tout journalisé (groupe=true).
 * Le pack tarifaire (ex. 265 € TEF+civique) est porté par les montants envoyés (réparti côté UI).
 * Le mono /api/examens/ventes reste inchangé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chargerVente, genererDocumentsVente, envoyerDocumentsVente, journal,
  SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
} from "@/lib/examens";
import { facturerVente, envoyerFacture } from "@/lib/factures";
import { checkInscriptionExamen } from "@/lib/examenCarence";
import { estDirection } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 120; // plusieurs documents + emails + factures à la suite
export const dynamic = "force-dynamic";

const MODES = ["Espèces", "CB", "Mixte"];
const STATUTS = ["Payé", "Inclus CPF", "Acompte", "Remboursé", "Annulé"];
const AGENCES = ["Gagny", "Sarcelles", "Rosny"];
const MAX_PANIER = 5;

async function garde(req: NextRequest): Promise<NextResponse | { user: SessionUser }> {
  try { const user = await requireUser(req); return { user }; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

/** Validation d'un examen du panier ; erreurs préfixées « Examen N ». */
function validerExamen(e: any, n: number, recap: string[]) {
  const p = `Examen ${n}`;
  const type = String(e?.type_examen ?? "");
  const sousType = String(e?.sous_type ?? "").trim();
  const montant = Number(e?.montant);
  const mode = String(e?.mode_paiement ?? "");
  const statut = String(e?.statut_paiement ?? "Payé");
  const reste = e?.reste_a_payer === undefined || e?.reste_a_payer === null || e?.reste_a_payer === "" ? 0 : Number(e.reste_a_payer);
  const dontCb = e?.dont_cb === undefined || e?.dont_cb === null || e?.dont_cb === "" ? null : Number(e.dont_cb);
  const sessionId = String(e?.session_id ?? "").trim() || null;

  if (!["TEF_IRN", "Examen_civique", "Vente_plateforme"].includes(type)) recap.push(`${p} : type d'examen invalide.`);
  if (type === "Examen_civique" && !SOUS_TYPES_CIVIQUE.includes(sousType)) recap.push(`${p} : mention OBLIGATOIRE pour l'examen civique.`);
  if (type === "TEF_IRN" && sousType && !MOTIVATIONS_TEF.includes(sousType)) recap.push(`${p} : motivation TEF inconnue.`);
  if (type === "Vente_plateforme" && !PLATEFORMES.includes(sousType)) recap.push(`${p} : application plateforme à choisir.`);
  if (type !== "Vente_plateforme" && !sessionId) recap.push(`${p} : session d'examen obligatoire.`);
  if (!Number.isFinite(montant) || montant < 0) recap.push(`${p} : montant invalide.`);
  if (!MODES.includes(mode)) recap.push(`${p} : mode de paiement Espèces / CB / Mixte.`);
  if (mode === "Mixte" && (dontCb === null || !Number.isFinite(dontCb) || dontCb < 0 || dontCb > montant)) recap.push(`${p} : « dont CB » requis (0 → montant).`);
  if (!STATUTS.includes(statut)) recap.push(`${p} : statut de paiement invalide.`);
  if (statut === "Acompte" && !(reste > 0)) recap.push(`${p} : statut « Acompte » → reste à payer (> 0).`);
  if (statut !== "Acompte" && reste > 0) recap.push(`${p} : reste à payer > 0 seulement avec « Acompte ».`);
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const u = g.user;

  const body = await req.json().catch(() => ({} as any));
  const c = body?.candidat ?? {};
  const examens: any[] = Array.isArray(body?.examens) ? body.examens : [];
  const venduPar = String(body?.vendu_par ?? "").trim();
  const agence = String(body?.agence ?? "").trim();
  const carenceForcer = body?.carence_forcer === true || body?.carence_forcer === "true" || body?.carence_forcer === 1;
  const carenceMotif = String(body?.carence_motif ?? "").trim();

  const recap: string[] = [];
  const nom = String(c?.nom ?? "").trim();
  const prenom = String(c?.prenom ?? "").trim();
  const email = String(c?.email ?? "").trim().toLowerCase();
  if (!nom) recap.push("Nom du candidat obligatoire.");
  if (!prenom) recap.push("Prénom du candidat obligatoire.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) recap.push("Email du candidat invalide (envoi des documents).");
  if (examens.length === 0) recap.push("Sélectionnez au moins un examen.");
  if (examens.length > MAX_PANIER) recap.push(`Maximum ${MAX_PANIER} examens par inscription groupée.`);
  if (!venduPar) recap.push("« Vendu par » obligatoire.");
  if (!AGENCES.includes(agence)) recap.push("Agence de vente : Gagny / Sarcelles / Rosny.");
  examens.forEach((e, i) => validerExamen(e, i + 1, recap));
  if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

  // ----- Candidat (retrouvé par email, sinon créé) -----
  const identite: Record<string, unknown> = {
    civilite: String(c?.civilite ?? "").trim() || null,
    nom, prenom, email,
    telephone: String(c?.telephone ?? "").trim() || null,
    date_naissance: String(c?.date_naissance ?? "").trim() || null,
    adresse: String(c?.adresse ?? "").trim() || null,
    cp: String(c?.cp ?? "").trim() || null,
    ville: String(c?.ville ?? "").trim() || null,
    num_piece_identite: String(c?.num_piece_identite ?? "").trim() || null,
    agence: String(c?.agence ?? agence).trim() || agence,
  };
  let candidatId: string;
  const { data: existant } = await supabaseAdmin.from("stagiaires").select("id").eq("email", email).maybeSingle();
  if (existant?.id) {
    candidatId = (existant as any).id;
    const champs = Object.fromEntries(Object.entries(identite).filter(([, v]) => v !== null && v !== ""));
    await supabaseAdmin.from("stagiaires").update(champs).eq("id", candidatId);
  } else {
    const { data, error } = await supabaseAdmin.from("stagiaires").insert(identite).select("id").single();
    if (error || !data) return NextResponse.json({ ok: false, erreur: error?.message ?? "Création du candidat impossible." }, { status: 500 });
    candidatId = (data as any).id;
  }

  // ----- PHASE 1 : pré-contrôle global (rien n'est créé) -----
  const prepare: Array<{ e: any; dateExamen: string | null }> = [];
  const blocages: string[] = [];   // carences (forçables par la Direction)
  const blocagesDurs: string[] = []; // places pleines (jamais forçables)

  for (let i = 0; i < examens.length; i++) {
    const e = examens[i];
    const n = i + 1;
    let dateExamen: string | null = null;
    if (e.type_examen !== "Vente_plateforme" && e.session_id) {
      const { data: sess } = await supabaseAdmin.from("v_sessions_examen").select("restantes, capacite").eq("id", e.session_id).maybeSingle();
      if (sess && (sess as any).restantes <= 0) blocagesDurs.push(`Examen ${n} : session pleine (capacité ${(sess as any).capacite}). Choisissez une autre session.`);
      const { data: s2 } = await supabaseAdmin.from("sessions_examen").select("date_examen").eq("id", e.session_id).maybeSingle();
      dateExamen = (s2 as any)?.date_examen ?? null;
    }
    prepare.push({ e, dateExamen });
  }

  // Carence de chaque examen (par rapport aux passages EN BASE).
  for (let i = 0; i < prepare.length; i++) {
    const { e, dateExamen } = prepare[i];
    const car = await checkInscriptionExamen({
      type: e.type_examen,
      sousType: e.sous_type || null,
      candidatId,
      dateExamen,
      declaratifTefDate: e.type_examen === "TEF_IRN" && e.tef_passage_externe ? (e.tef_passage_externe_date || null) : null,
    });
    if (!car.ok) blocages.push(...car.recap.map((r) => `Examen ${i + 1} : ${r}`));
  }

  // Règle INTER-PANIER : 2 examens civiques de mentions DIFFÉRENTES le même jour.
  const civ = prepare.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => p.e.type_examen === "Examen_civique" && p.dateExamen);
  for (let i = 0; i < civ.length; i++) {
    for (let j = i + 1; j < civ.length; j++) {
      if (civ[i].dateExamen === civ[j].dateExamen && (civ[i].e.sous_type || "") !== (civ[j].e.sous_type || "")) {
        blocages.push(`Examens ${civ[i].n} & ${civ[j].n} : deux mentions civiques différentes ne peuvent pas avoir lieu le même jour.`);
      }
    }
  }

  // Décision de blocage : les places pleines sont TOUJOURS bloquantes.
  // Les carences sont forçables UNIQUEMENT par la Direction avec un motif (journalisé).
  let carenceAppliquee = false;
  if (blocagesDurs.length > 0) {
    return NextResponse.json({ ok: false, status: "gate_ko", recap: [...blocagesDurs, ...blocages] }, { status: 409 });
  }
  if (blocages.length > 0) {
    if (carenceForcer && estDirection(u.role) && carenceMotif) {
      carenceAppliquee = true;
      await journal("ventes_examen", candidatId, "carence_forcee_groupe", { motif: carenceMotif, recap: blocages }, u.email ?? venduPar);
    } else if (carenceForcer && !estDirection(u.role)) {
      return NextResponse.json({ ok: false, status: "gate_ko", recap: [...blocages, "Seule la Direction peut forcer une inscription en carence."] }, { status: 409 });
    } else {
      return NextResponse.json({ ok: false, status: "gate_ko", recap: blocages }, { status: 409 });
    }
  }

  // ----- PHASE 2 : création de chaque inscription -----
  const inscriptions: any[] = [];
  for (const { e } of prepare) {
    const estPlat = e.type_examen === "Vente_plateforme";
    const mode = String(e.mode_paiement);
    const statut = String(e.statut_paiement);
    const { data: vente, error: venteErr } = await supabaseAdmin
      .from("ventes_examen")
      .insert({
        candidat_id: candidatId,
        session_id: estPlat ? null : (String(e.session_id ?? "").trim() || null),
        type_examen: e.type_examen,
        sous_type: String(e.sous_type ?? "").trim() || null,
        montant: Number(e.montant),
        mode_paiement: mode,
        dont_cb: mode === "Mixte" ? Number(e.dont_cb) : null,
        statut_paiement: statut,
        reste_a_payer: statut === "Acompte" ? Number(e.reste_a_payer) : 0,
        vendu_par: venduPar,
        agence,
        commentaire: String(e.commentaire ?? "").trim() || null,
        tef_passage_externe_declare: e.type_examen === "TEF_IRN" ? !!e.tef_passage_externe : false,
        tef_passage_externe_date: e.type_examen === "TEF_IRN" && e.tef_passage_externe ? (e.tef_passage_externe_date || null) : null,
        carence_forcee: carenceAppliquee,
        carence_forcee_motif: carenceAppliquee ? carenceMotif : null,
        numero_attestation: "ATTRIBUE_PAR_LE_SERVEUR",
      })
      .select("id, numero_attestation")
      .single();

    if (venteErr || !vente) {
      inscriptions.push({ ok: false, type: e.type_examen, sousType: e.sous_type || null, erreur: venteErr?.message ?? "Insertion impossible." });
      continue;
    }
    const venteId = (vente as any).id as string;
    const numero = (vente as any).numero_attestation as string;
    await journal("ventes_examen", venteId, "examen_vendu",
      { numero_attestation: numero, type: e.type_examen, sous_type: e.sous_type || null, montant: Number(e.montant), agence, candidat: `${prenom} ${nom}`, groupe: true }, venduPar);

    // Documents + email (la vente reste valide même en cas d'échec ici).
    let documents: Array<{ piece: string; chemin: string }> = [];
    let envoiOk = false; let erreurDocs: string | null = null;
    try {
      const vc = (await chargerVente(venteId))!;
      const docs = await genererDocumentsVente(vc);
      documents = docs.map((d) => ({ piece: d.piece, chemin: d.chemin }));
      await journal("ventes_examen", venteId, "attestation_emise", { numero_attestation: numero }, venduPar);
      if (docs.some((d) => d.piece === "convocation")) await journal("ventes_examen", venteId, "convocation_generee", { numero_attestation: numero }, venduPar);
      const envoi = await envoyerDocumentsVente(vc, docs);
      envoiOk = envoi.ok;
      if (envoi.ok) {
        await journal("ventes_examen", venteId, "convocation_envoyee", { a: email }, venduPar);
        const maintenant = new Date().toISOString();
        const maj: Record<string, string> = {};
        if (docs.some((d) => d.piece === "convocation")) maj.convocation_envoyee_le = maintenant;
        if (docs.some((d) => d.piece === "attestation")) maj.attestation_envoyee_le = maintenant;
        if (Object.keys(maj).length) await supabaseAdmin.from("ventes_examen").update(maj).eq("id", venteId);
      }
    } catch (err: any) {
      erreurDocs = err?.message ?? String(err);
      await journal("ventes_examen", venteId, "documents_echec", { erreur: erreurDocs }, venduPar);
    }

    // Facturation (identique au mono : Espèces différée, CB/Mixte automatique).
    let facture: { numero: string; envoyee: boolean; erreur?: string } | null = null;
    let factureDifferee = false;
    if (["Annulé", "Remboursé"].includes(statut)) {
      // pas de document comptable
    } else if (mode === "Espèces") {
      factureDifferee = true;
      await journal("ventes_examen", venteId, "facture_differee_especes", { numero_attestation: numero }, venduPar);
    } else {
      try {
        const f = await facturerVente(venteId, venduPar);
        const ef = await envoyerFacture(f.id, "emission", venduPar);
        facture = { numero: f.numero, envoyee: ef.ok, erreur: ef.erreur };
      } catch (err: any) {
        facture = { numero: "", envoyee: false, erreur: err?.message ?? String(err) };
        await journal("ventes_examen", venteId, "facture_echec", { erreur: facture.erreur }, venduPar);
      }
    }

    inscriptions.push({
      ok: true, venteId, type: e.type_examen, sousType: e.sous_type || null,
      numeroAttestation: numero, documents, factureDifferee, facture,
      email: envoiOk ? { envoye: true, a: email } : { envoye: false, erreur: erreurDocs ?? "Échec de l'envoi." },
    });
  }

  return NextResponse.json({ ok: true, candidatId, inscriptions });
}
