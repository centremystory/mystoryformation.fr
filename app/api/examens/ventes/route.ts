/**
 * MYSTORY — /api/examens/ventes
 * POST — LA vente en une seule action (§2.1) :
 *   candidat (créé ou retrouvé par email) → vente (le trigger SQL attribue le n° MYS-AAAA-NNNNN,
 *   vérifie sous-type civique + session non complète) → attestation + convocation générées,
 *   archivées et ENVOYÉES par email → tout journalisé.
 *   La vente reste valide même si la génération/l'envoi échoue (statuts détaillés renvoyés,
 *   regénération possible) — le numéro et le paiement font foi.
 * GET — liste des ventes (?session=… pour le jour J, sinon 50 dernières).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chargerVente, genererDocumentsVente, envoyerDocumentsVente, journal,
  SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
} from "@/lib/examens";
import { facturerVente, envoyerFacture } from "@/lib/factures";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest) {
  try { await requireUser(req); return null; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  const session = req.nextUrl.searchParams.get("session");
  let q = supabaseAdmin
    .from("ventes_examen")
    .select("*, stagiaires:candidat_id (civilite, nom, prenom, email, telephone), sessions_examen:session_id (type, date_examen, horaire)")
    .order("created_at", { ascending: false });
  q = session ? q.eq("session_id", session) : q.limit(50);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ventes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const c = body?.candidat ?? {};
  const v = body?.vente ?? {};
  const recap: string[] = [];

  // ----- Validation candidat -----
  const nom = String(c.nom ?? "").trim();
  const prenom = String(c.prenom ?? "").trim();
  const email = String(c.email ?? "").trim().toLowerCase();
  const agenceCandidat = String(c.agence ?? v.agence ?? "").trim();
  if (!nom) recap.push("Nom du candidat obligatoire.");
  if (!prenom) recap.push("Prénom du candidat obligatoire.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) recap.push("Email du candidat invalide (nécessaire pour l'envoi des documents).");

  // ----- Validation vente -----
  const type = String(v.type_examen ?? "");
  const sousType = String(v.sous_type ?? "").trim();
  const montant = Number(v.montant);
  const mode = String(v.mode_paiement ?? "");
  const dontCb = v.dont_cb === undefined || v.dont_cb === null || v.dont_cb === "" ? null : Number(v.dont_cb);
  const statutPaiement = String(v.statut_paiement ?? "Payé");
  const resteAPayer = v.reste_a_payer === undefined || v.reste_a_payer === null || v.reste_a_payer === "" ? 0 : Number(v.reste_a_payer);
  const venduPar = String(v.vendu_par ?? "").trim();
  const agence = String(v.agence ?? "").trim();
  const sessionId = String(v.session_id ?? "").trim() || null;

  if (!["TEF_IRN", "Examen_civique", "Vente_plateforme"].includes(type)) recap.push("Type d'examen invalide.");
  if (type === "Examen_civique" && !SOUS_TYPES_CIVIQUE.includes(sousType))
    recap.push("Sous-type OBLIGATOIRE pour l'examen civique (la mention conditionne l'épreuve).");
  if (type === "TEF_IRN" && sousType && !MOTIVATIONS_TEF.includes(sousType))
    recap.push("Motivation TEF inconnue (libellés CCI 04/05/06/10).");
  if (type === "Vente_plateforme" && !PLATEFORMES.includes(sousType))
    recap.push("Application à choisir pour une vente plateforme (Passetontef / Prepcivique / Prepmyfuture).");
  if (type !== "Vente_plateforme" && !sessionId) recap.push("Session d'examen obligatoire (TEF et civique).");
  if (!Number.isFinite(montant) || montant < 0) recap.push("Montant invalide.");
  if (!["Espèces", "CB", "Mixte"].includes(mode)) recap.push("Mode de paiement : Espèces / CB / Mixte.");
  if (mode === "Mixte" && (dontCb === null || !Number.isFinite(dontCb) || dontCb < 0 || dontCb > montant))
    recap.push("Paiement mixte : « dont CB » requis, entre 0 et le montant.");
  if (!["Payé", "Inclus CPF", "Acompte", "Remboursé", "Annulé"].includes(statutPaiement)) recap.push("Statut de paiement invalide.");
  if (statutPaiement === "Acompte" && !(resteAPayer > 0)) recap.push("Statut « Acompte » : renseigner le reste à payer (> 0).");
  if (statutPaiement !== "Acompte" && resteAPayer > 0) recap.push("Reste à payer > 0 uniquement avec le statut « Acompte ».");
  if (!venduPar) recap.push("« Vendu par » obligatoire (traçabilité : qui fait quoi).");
  if (!["Gagny", "Sarcelles", "Rosny"].includes(agence)) recap.push("Agence de vente : Gagny / Sarcelles / Rosny.");

  if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

  // ----- Garde-fou places EN TEMPS RÉEL (anti-surbooking) — session obligatoire hors plateforme -----
  if (sessionId && type !== "Vente_plateforme") {
    const { data: sess } = await supabaseAdmin
      .from("v_sessions_examen").select("restantes, capacite").eq("id", sessionId).maybeSingle();
    if (sess && (sess as any).restantes <= 0) {
      return NextResponse.json({ ok: false, status: "gate_ko", recap: [`Session pleine : capacité (${(sess as any).capacite}) atteinte. Choisis une autre session.`] }, { status: 409 });
    }
  }

  // ----- Candidat : retrouvé par email, sinon créé (une seule fiche par personne) -----
  const identite: Record<string, unknown> = {
    civilite: String(c.civilite ?? "").trim() || null,
    nom, prenom, email,
    telephone: String(c.telephone ?? "").trim() || null,
    date_naissance: String(c.date_naissance ?? "").trim() || null,
    adresse: String(c.adresse ?? "").trim() || null,
    cp: String(c.cp ?? "").trim() || null,
    ville: String(c.ville ?? "").trim() || null,
    num_piece_identite: String(c.num_piece_identite ?? "").trim() || null,
    agence: agenceCandidat || agence,
  };
  const { data: existant } = await supabaseAdmin.from("stagiaires").select("id").eq("email", email).maybeSingle();
  let candidatId: string;
  if (existant) {
    candidatId = (existant as any).id;
    const champsRenseignes = Object.fromEntries(Object.entries(identite).filter(([, val]) => val !== null && val !== ""));
    const { error } = await supabaseAdmin.from("stagiaires").update(champsRenseignes).eq("id", candidatId);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabaseAdmin.from("stagiaires").insert(identite).select("id").single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    candidatId = (data as any).id;
  }

  // ----- Vente : le trigger SQL attribue le numéro et applique les verrous -----
  const { data: vente, error: venteErr } = await supabaseAdmin
    .from("ventes_examen")
    .insert({
      candidat_id: candidatId,
      session_id: type === "Vente_plateforme" ? null : sessionId,
      type_examen: type,
      sous_type: sousType || null,
      montant, mode_paiement: mode, dont_cb: mode === "Mixte" ? dontCb : null,
      statut_paiement: statutPaiement, reste_a_payer: resteAPayer,
      vendu_par: venduPar, agence,
      commentaire: String(v.commentaire ?? "").trim() || null,
      numero_attestation: "ATTRIBUE_PAR_LE_SERVEUR", // remplacé par le trigger (séquence)
    })
    .select("id, numero_attestation")
    .single();
  if (venteErr) {
    // Messages des verrous SQL (session complète, sous-type…) renvoyés tels quels.
    return NextResponse.json({ ok: false, status: "gate_ko", recap: [venteErr.message] }, { status: 409 });
  }
  const venteId = (vente as any).id as string;
  const numero = (vente as any).numero_attestation as string;
  await journal("ventes_examen", venteId, "examen_vendu",
    { numero_attestation: numero, type, sous_type: sousType || null, montant, agence, candidat: `${prenom} ${nom}` }, venduPar);

  // ----- Documents + envoi (la vente reste valide même en cas d'échec ici) -----
  let documents: Array<{ piece: string; chemin: string }> = [];
  let envoi: { ok: boolean; erreur?: string } = { ok: false, erreur: "Non tenté." };
  let erreurDocs: string | null = null;
  try {
    const vc = (await chargerVente(venteId))!;
    const docs = await genererDocumentsVente(vc);
    documents = docs.map((d) => ({ piece: d.piece, chemin: d.chemin }));
    await journal("ventes_examen", venteId, "attestation_emise", { numero_attestation: numero }, venduPar);
    if (docs.some((d) => d.piece === "convocation")) {
      await journal("ventes_examen", venteId, "convocation_generee", { numero_attestation: numero }, venduPar);
    }
    envoi = await envoyerDocumentsVente(vc, docs);
    if (envoi.ok) {
      await journal("ventes_examen", venteId, "convocation_envoyee", { a: email }, venduPar);
      const maintenant = new Date().toISOString();
      const majDocs: Record<string, string> = {};
      if (docs.some((d) => d.piece === "convocation")) majDocs.convocation_envoyee_le = maintenant;
      if (docs.some((d) => d.piece === "attestation")) majDocs.attestation_envoyee_le = maintenant;
      if (Object.keys(majDocs).length) await supabaseAdmin.from("ventes_examen").update(majDocs).eq("id", venteId);
    }
  } catch (e: any) {
    erreurDocs = e?.message ?? String(e);
    await journal("ventes_examen", venteId, "documents_echec", { erreur: erreurDocs }, venduPar);
  }

  // ----- Facturation à la vente (§6) -----
  // Espèces → ATTESTATION SEULE : pas de facture auto. La vente apparaît dans « À facturer »
  // et sera facturée après validation (émission manuelle, série MYS-2026).
  // Autres modes (CB, Mixte) → facture automatique. Jamais pour Annulé/Remboursé.
  let facture: { numero: string; envoyee: boolean; erreur?: string } | null = null;
  let factureDifferee = false;
  if (["Annulé", "Remboursé"].includes(statutPaiement)) {
    // pas de document comptable
  } else if (mode === "Espèces") {
    factureDifferee = true;
    await journal("ventes_examen", venteId, "facture_differee_especes",
      { numero_attestation: numero, motif: "Espèces : attestation seule, à facturer après validation" }, venduPar);
  } else {
    try {
      const f = await facturerVente(venteId, venduPar);
      const envoiFacture = await envoyerFacture(f.id, "emission", venduPar);
      facture = { numero: f.numero, envoyee: envoiFacture.ok, erreur: envoiFacture.erreur };
    } catch (e: any) {
      facture = { numero: "", envoyee: false, erreur: e?.message ?? String(e) };
      await journal("ventes_examen", venteId, "facture_echec", { erreur: facture.erreur }, venduPar);
    }
  }

  return NextResponse.json({
    ok: true,
    venteId,
    numeroAttestation: numero,
    documents,
    facture,
    factureDifferee,
    email: envoi.ok
      ? { envoye: true, a: email }
      : { envoye: false, erreur: envoi.erreur ?? erreurDocs ?? "Échec de l'envoi." },
  });
}

export async function PATCH(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const { data: avant } = await supabaseAdmin.from("ventes_examen").select("inscrit_cci, statut_paiement, reste_a_payer, vendu_par").eq("id", id).maybeSingle();
  if (!avant) return NextResponse.json({ ok: false, erreur: "Vente introuvable." }, { status: 404 });

  const maj: Record<string, unknown> = {};
  if (typeof body.inscrit_cci === "boolean") maj.inscrit_cci = body.inscrit_cci;
  if (body.acompte_solde === true) { maj.statut_paiement = "Payé"; maj.reste_a_payer = 0; }
  if (Object.keys(maj).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à modifier (inscrit_cci ou acompte_solde)." }, { status: 400 });

  const { error } = await supabaseAdmin.from("ventes_examen").update(maj).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const auteur = String(body?.auteur ?? "").trim() || null;
  if (maj.inscrit_cci !== undefined) {
    await journal("ventes_examen", id, maj.inscrit_cci ? "inscrit_cci_coche" : "inscrit_cci_decoche", { avant: (avant as any).inscrit_cci }, auteur);
  }
  if (body.acompte_solde === true) {
    await journal("ventes_examen", id, "acompte_solde", { reste_avant: (avant as any).reste_a_payer }, auteur);
  }
  return NextResponse.json({ ok: true });
}
