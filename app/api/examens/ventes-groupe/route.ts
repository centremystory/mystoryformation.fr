/**
 * MYSTORY — /api/examens/ventes-groupe  (Sens A1 + A3 : inscription CROISÉE / panier)
 * POST — inscrit un candidat à PLUSIEURS examens en une seule action.
 *   1) Candidat créé/retrouvé par email (une seule fiche).
 *   2) PRÉ-CONTRÔLE GLOBAL (rien créé) : places + carences de chaque examen
 *      + règle « pas 2 mentions civiques différentes le même jour » À L'INTÉRIEUR du panier.
 *      Si une seule règle bloque → 409, RIEN n'est créé (sauf override Direction + motif).
 *   3) Création de chaque inscription (insert → attestation+convocation → facture).
 *   4) ENVOI (A3) : les convocations d'un MÊME JOUR sont FUSIONNÉES en un seul PDF et
 *      envoyées en un seul email (avec les attestations du jour). Les examens isolés
 *      ou plateforme partent en envoi individuel comme le mono.
 * Le mono /api/examens/ventes reste inchangé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chargerVente, genererDocumentsVente, envoyerDocumentsVente, envoyerConvocationsGroupees, journal,
  SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
  type DocumentGenere, type VenteComplete,
} from "@/lib/examens";
import { fusionnerPdfs } from "@/lib/pdfMerge";
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

  // ----- PHASE 2a : création de chaque inscription (documents générés, PAS encore envoyés) -----
  type Ligne = {
    e: any; insertOk: boolean; venteId: string; numero: string; statut: string; mode: string;
    vc: VenteComplete | null; docs: DocumentGenere[]; dateExamen: string | null;
    facture: { numero: string; envoyee: boolean; erreur?: string } | null; factureDifferee: boolean;
    erreurDocs: string | null; erreurInsert?: string;
  };
  const lignes: Ligne[] = [];

  for (const { e, dateExamen } of prepare) {
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
      lignes.push({ e, insertOk: false, venteId: "", numero: "", statut, mode, vc: null, docs: [], dateExamen, facture: null, factureDifferee: false, erreurDocs: null, erreurInsert: venteErr?.message ?? "Insertion impossible." });
      continue;
    }
    const venteId = (vente as any).id as string;
    const numero = (vente as any).numero_attestation as string;
    await journal("ventes_examen", venteId, "examen_vendu",
      { numero_attestation: numero, type: e.type_examen, sous_type: e.sous_type || null, montant: Number(e.montant), agence, candidat: `${prenom} ${nom}`, groupe: true }, venduPar);

    // Documents (génération + archivage, SANS envoi : l'envoi est groupé en phase 2b).
    let vc: VenteComplete | null = null;
    let docs: DocumentGenere[] = [];
    let erreurDocs: string | null = null;
    try {
      vc = (await chargerVente(venteId))!;
      docs = await genererDocumentsVente(vc);
      await journal("ventes_examen", venteId, "attestation_emise", { numero_attestation: numero }, venduPar);
      if (docs.some((d) => d.piece === "convocation")) await journal("ventes_examen", venteId, "convocation_generee", { numero_attestation: numero }, venduPar);
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

    lignes.push({ e, insertOk: true, venteId, numero, statut, mode, vc, docs, dateExamen, facture, factureDifferee, erreurDocs });
  }

  // ----- PHASE 2b : envoi (convocations du même jour fusionnées en un seul email) -----
  const envoiParVente: Record<string, { envoye: boolean; erreur?: string }> = {};
  const dejaEnvoye = new Set<string>();

  // Lignes ayant une convocation officielle ET une date → regroupables par jour.
  const parJour: Record<string, Ligne[]> = {};
  for (const l of lignes) {
    if (l.insertOk && l.vc && l.dateExamen && l.docs.some((d) => d.piece === "convocation")) {
      (parJour[l.dateExamen] ??= []).push(l);
    }
  }

  for (const [jour, grp] of Object.entries(parJour)) {
    if (grp.length < 2) continue; // un seul examen ce jour-là → envoi individuel ci-dessous
    try {
      const convocs = grp.map((l) => l.docs.find((d) => d.piece === "convocation")!.pdf);
      const attests = grp.map((l) => l.docs.find((d) => d.piece === "attestation")!).filter(Boolean) as DocumentGenere[];
      const candidatJour = grp[0].vc!.candidat;
      const nomFus = `Convocations_${String(candidatJour.nom ?? "")}_${jour}.pdf`;
      const fus = await fusionnerPdfs(convocs);
      const env = await envoyerConvocationsGroupees({
        candidat: candidatJour,
        dateExamenISO: jour,
        examensDuJour: grp.map((l) => ({
          vente: { ...l.vc!.vente, numero_attestation: l.numero, type_examen: l.e.type_examen, sous_type: l.e.sous_type || null, vendu_par: venduPar },
          session: l.vc!.session,
        })),
        attestations: attests,
        convocationGroupee: { nom: nomFus, pdf: fus },
      });
      const maintenant = new Date().toISOString();
      for (const l of grp) {
        dejaEnvoye.add(l.venteId);
        envoiParVente[l.venteId] = { envoye: env.ok, erreur: env.ok ? undefined : (env.erreur ?? "Échec de l'envoi groupé.") };
        if (env.ok) {
          await journal("ventes_examen", l.venteId, "convocation_groupee_envoyee", { a: email, jour, epreuves: grp.length }, venduPar);
          await supabaseAdmin.from("ventes_examen").update({ convocation_envoyee_le: maintenant, attestation_envoyee_le: maintenant }).eq("id", l.venteId);
        }
      }
    } catch (err: any) {
      for (const l of grp) {
        dejaEnvoye.add(l.venteId);
        envoiParVente[l.venteId] = { envoye: false, erreur: err?.message ?? "Fusion / envoi groupé impossible." };
      }
    }
  }

  // Envoi individuel pour tout ce qui n'a pas été envoyé en groupe (examens isolés + plateformes).
  for (const l of lignes) {
    if (!l.insertOk || dejaEnvoye.has(l.venteId)) continue;
    if (!l.vc) { envoiParVente[l.venteId] = { envoye: false, erreur: l.erreurDocs ?? "Documents non générés." }; continue; }
    try {
      const env = await envoyerDocumentsVente(l.vc, l.docs);
      envoiParVente[l.venteId] = { envoye: env.ok, erreur: env.ok ? undefined : (env.erreur ?? "Échec de l'envoi.") };
      if (env.ok) {
        await journal("ventes_examen", l.venteId, "convocation_envoyee", { a: email }, venduPar);
        const maintenant = new Date().toISOString();
        const maj: Record<string, string> = {};
        if (l.docs.some((d) => d.piece === "convocation")) maj.convocation_envoyee_le = maintenant;
        if (l.docs.some((d) => d.piece === "attestation")) maj.attestation_envoyee_le = maintenant;
        if (Object.keys(maj).length) await supabaseAdmin.from("ventes_examen").update(maj).eq("id", l.venteId);
      }
    } catch (err: any) {
      envoiParVente[l.venteId] = { envoye: false, erreur: err?.message ?? "Échec de l'envoi." };
    }
  }

  // ----- Résultat par examen -----
  const inscriptions = lignes.map((l) => {
    if (!l.insertOk) return { ok: false, type: l.e.type_examen, sousType: l.e.sous_type || null, erreur: l.erreurInsert ?? "Insertion impossible." };
    const env = envoiParVente[l.venteId] ?? { envoye: false, erreur: "Non envoyé." };
    return {
      ok: true, venteId: l.venteId, type: l.e.type_examen, sousType: l.e.sous_type || null,
      numeroAttestation: l.numero, documents: l.docs.map((d) => ({ piece: d.piece, chemin: d.chemin })),
      factureDifferee: l.factureDifferee, facture: l.facture,
      email: env.envoye ? { envoye: true, a: email } : { envoye: false, erreur: env.erreur ?? l.erreurDocs ?? "Échec de l'envoi." },
      groupee: dejaEnvoye.has(l.venteId),
    };
  });

  return NextResponse.json({ ok: true, candidatId, inscriptions });
}
