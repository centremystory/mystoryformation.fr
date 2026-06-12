/**
 * MYSTORY — /api/examens/corrections  (§2.6 — corrections tracées)
 * GET  ?numero=MYS-AAAA-NNNNN → retrouve la vente (pré-visualisation du formulaire).
 * POST { numero_attestation, champ, nouvelle_valeur, demande_par, renvoyer_documents }
 *   → applique la correction (identité candidat OU vente OU changement de session),
 *     enregistre l'ancienne → nouvelle valeur au registre immuable `corrections`,
 *     regénère les documents avec la mention « (corrigée) » et les renvoie par email
 *     (« mise à jour — remplace la version précédente ») si demandé.
 * Le changement de session décoche automatiquement « inscrit CCI » (trigger SQL).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chargerVente, genererDocumentsVente, envoyerDocumentsVente, journal,
  SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
} from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// champ → { table, colonne } (menus adaptés côté UI)
const CHAMPS: Record<string, { table: "stagiaires" | "ventes_examen" | "session"; colonne: string; libelle: string }> = {
  nom: { table: "stagiaires", colonne: "nom", libelle: "Nom" },
  prenom: { table: "stagiaires", colonne: "prenom", libelle: "Prénom" },
  civilite: { table: "stagiaires", colonne: "civilite", libelle: "Civilité" },
  date_naissance: { table: "stagiaires", colonne: "date_naissance", libelle: "Date de naissance" },
  email: { table: "stagiaires", colonne: "email", libelle: "Email" },
  telephone: { table: "stagiaires", colonne: "telephone", libelle: "Téléphone" },
  num_piece_identite: { table: "stagiaires", colonne: "num_piece_identite", libelle: "N° étranger / pièce d'identité" },
  session: { table: "session", colonne: "session_id", libelle: "Session (date / horaire)" },
  sous_type: { table: "ventes_examen", colonne: "sous_type", libelle: "Sous-type / motivation" },
  montant: { table: "ventes_examen", colonne: "montant", libelle: "Montant" },
  mode_paiement: { table: "ventes_examen", colonne: "mode_paiement", libelle: "Mode de paiement" },
  dont_cb: { table: "ventes_examen", colonne: "dont_cb", libelle: "Dont CB" },
  statut_paiement: { table: "ventes_examen", colonne: "statut_paiement", libelle: "Statut du paiement" },
  reste_a_payer: { table: "ventes_examen", colonne: "reste_a_payer", libelle: "Reste à payer" },
  vendu_par: { table: "ventes_examen", colonne: "vendu_par", libelle: "Vendu par" },
  agence: { table: "ventes_examen", colonne: "agence", libelle: "Agence" },
};

async function garde(req: NextRequest) {
  try { await requireUser(req); return null; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

async function venteParNumero(numero: string) {
  const { data } = await supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, type_examen, sous_type, montant, mode_paiement, dont_cb, statut_paiement, reste_a_payer, vendu_par, agence, inscrit_cci, session_id, candidat_id, stagiaires:candidat_id (civilite, nom, prenom, email, telephone, date_naissance, num_piece_identite), sessions_examen:session_id (type, date_examen, horaire)")
    .eq("numero_attestation", numero)
    .maybeSingle();
  return data as any;
}

export async function GET(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  const numero = req.nextUrl.searchParams.get("numero")?.trim().toUpperCase();
  if (!numero) return NextResponse.json({ ok: false, erreur: "numero requis." }, { status: 400 });
  const vente = await venteParNumero(numero);
  if (!vente) return NextResponse.json({ ok: false, erreur: "Aucune vente avec ce numéro d'attestation." }, { status: 404 });
  const { data: historique } = await supabaseAdmin
    .from("corrections").select("*").eq("vente_id", vente.id).order("horodatage", { ascending: false });
  return NextResponse.json({ ok: true, vente, historique: historique ?? [] });
}

export async function POST(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const numero = String(body?.numero_attestation ?? "").trim().toUpperCase();
  const champ = String(body?.champ ?? "");
  const nouvelle = String(body?.nouvelle_valeur ?? "").trim();
  const demandePar = String(body?.demande_par ?? "").trim();
  const renvoyer = body?.renvoyer_documents !== false; // par défaut : on renvoie

  const def = CHAMPS[champ];
  if (!numero || !def) return NextResponse.json({ ok: false, erreur: "numero_attestation et champ valides requis." }, { status: 400 });
  if (!demandePar) return NextResponse.json({ ok: false, erreur: "« Demandé par » obligatoire (traçabilité)." }, { status: 400 });
  if (!nouvelle && champ !== "dont_cb") return NextResponse.json({ ok: false, erreur: "Nouvelle valeur requise." }, { status: 400 });

  const vente = await venteParNumero(numero);
  if (!vente) return NextResponse.json({ ok: false, erreur: "Aucune vente avec ce numéro d'attestation." }, { status: 404 });

  // ----- Validation de la nouvelle valeur selon le champ et le type d'examen -----
  const t = vente.type_examen as string;
  let valeur: unknown = nouvelle;
  let ancienne: unknown;

  if (champ === "sous_type") {
    const valides = t === "Examen_civique" ? SOUS_TYPES_CIVIQUE : t === "TEF_IRN" ? MOTIVATIONS_TEF : PLATEFORMES;
    if (!valides.includes(nouvelle)) return NextResponse.json({ ok: false, erreur: `Valeur invalide pour ${t} : ${valides.join(" / ")}.` }, { status: 400 });
  }
  if (champ === "mode_paiement" && !["Espèces", "CB", "Mixte"].includes(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Mode : Espèces / CB / Mixte." }, { status: 400 });
  if (champ === "statut_paiement" && !["Payé", "Inclus CPF", "Acompte", "Remboursé", "Annulé"].includes(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Statut de paiement invalide." }, { status: 400 });
  if (champ === "agence" && !["Gagny", "Sarcelles", "Rosny"].includes(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Agence : Gagny / Sarcelles / Rosny." }, { status: 400 });
  if (champ === "civilite" && !["Madame", "Monsieur", "Autre"].includes(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Civilité : Madame / Monsieur / Autre." }, { status: 400 });
  if (["montant", "reste_a_payer", "dont_cb"].includes(champ)) {
    const n = nouvelle === "" ? null : Number(nouvelle);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return NextResponse.json({ ok: false, erreur: "Valeur numérique ≥ 0 requise." }, { status: 400 });
    valeur = n;
  }
  if (champ === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Email invalide." }, { status: 400 });
  if (champ === "date_naissance" && !/^\d{4}-\d{2}-\d{2}$/.test(nouvelle))
    return NextResponse.json({ ok: false, erreur: "Date au format AAAA-MM-JJ." }, { status: 400 });

  // ----- Application -----
  if (def.table === "stagiaires") {
    ancienne = vente.stagiaires?.[def.colonne] ?? null;
    const { error } = await supabaseAdmin.from("stagiaires").update({ [def.colonne]: valeur }).eq("id", vente.candidat_id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  } else if (def.table === "session") {
    if (t === "Vente_plateforme") return NextResponse.json({ ok: false, erreur: "Une vente plateforme n'a pas de session." }, { status: 400 });
    const { data: nouvelleSession } = await supabaseAdmin.from("sessions_examen").select("id, type, date_examen, horaire").eq("id", nouvelle).maybeSingle();
    if (!nouvelleSession) return NextResponse.json({ ok: false, erreur: "Nouvelle session introuvable." }, { status: 404 });
    if ((nouvelleSession as any).type !== t) return NextResponse.json({ ok: false, erreur: "La nouvelle session doit être du même type d'examen." }, { status: 400 });
    ancienne = vente.sessions_examen ? `${vente.sessions_examen.date_examen} ${vente.sessions_examen.horaire}` : null;
    valeur = `${(nouvelleSession as any).date_examen} ${(nouvelleSession as any).horaire}`;
    // Le trigger vérifie la capacité et DÉCOCHE inscrit_cci automatiquement.
    const { error } = await supabaseAdmin.from("ventes_examen").update({ session_id: nouvelle }).eq("id", vente.id);
    if (error) return NextResponse.json({ ok: false, status: "gate_ko", recap: [error.message] }, { status: 409 });
  } else {
    ancienne = vente[def.colonne] ?? null;
    const maj: Record<string, unknown> = { [def.colonne]: valeur };
    if (champ === "statut_paiement" && nouvelle !== "Acompte") maj.reste_a_payer = 0;
    const { error } = await supabaseAdmin.from("ventes_examen").update(maj).eq("id", vente.id);
    if (error) return NextResponse.json({ ok: false, status: "gate_ko", recap: [error.message] }, { status: 409 });
  }

  // ----- Registre immuable + journal -----
  await supabaseAdmin.from("corrections").insert({
    vente_id: vente.id,
    champ_corrige: def.libelle,
    ancienne_valeur: ancienne === null || ancienne === undefined ? null : String(ancienne),
    nouvelle_valeur: valeur === null ? null : String(valeur),
    documents_renvoyes: renvoyer,
    demande_par: demandePar,
  });
  await journal("ventes_examen", vente.id, "correction_effectuee",
    { numero_attestation: numero, champ: def.libelle, ancienne: ancienne ?? null, nouvelle: valeur ?? null }, demandePar);

  // CCI décoché par changement de session → alerte explicite au journal
  if (def.table === "session" && vente.inscrit_cci) {
    await journal("ventes_examen", vente.id, "inscrit_cci_decoche",
      { motif: "Changement de date d'examen — vérifier/modifier l'inscription côté CCI." }, demandePar);
  }

  // ----- Regénération « (corrigée) » + renvoi -----
  let documents: string[] = [];
  let emailStatut: { envoye: boolean; erreur?: string } = { envoye: false };
  try {
    const vc = (await chargerVente(vente.id))!;
    const docs = await genererDocumentsVente(vc, { corrigee: true });
    documents = docs.map((d) => d.piece);
    if (renvoyer) {
      const res = await envoyerDocumentsVente(vc, docs, { corrigee: true });
      emailStatut = res.ok ? { envoye: true } : { envoye: false, erreur: res.erreur };
    }
  } catch (e: any) {
    emailStatut = { envoye: false, erreur: e?.message ?? String(e) };
  }

  return NextResponse.json({
    ok: true,
    numero_attestation: numero,
    champ: def.libelle,
    ancienne_valeur: ancienne ?? null,
    nouvelle_valeur: valeur ?? null,
    cci_decoche: def.table === "session",
    documents_regeneres: documents,
    email: emailStatut,
  });
}
