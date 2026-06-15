/**
 * MYSTORY — POST /api/documents/envoyer-dossier
 * Envoie TOUS les documents archivés d'un dossier au stagiaire, en UN seul email.
 * Canal : Resend (lib/email.ts) — expéditeur contact@mystoryformation.fr, pièces jointes PDF.
 * Pas de dépendance n8n : le CRM télécharge les PDF archivés et les joint directement.
 *
 * Repli propre (drapeau) : si RESEND_API_KEY est absente, on ne casse rien — statut
 * « canal_inactif » + trace au journal (même règle que partout ailleurs).
 *
 * Body : { dossierId: string }
 * Conformité : lieu de formation = Gagny ; on n'envoie que des pièces déjà archivées
 * (donc déjà passées par les portes de conformité) ; la version signée prime sur la générée.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche } from "@/lib/crm";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF, type PieceJointe } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

// Libellés lisibles pour le corps de l'email + le nom des pièces jointes.
const LIBELLE: Record<string, string> = {
  convention: "Convention de formation",
  convocation: "Convocation",
  programme: "Programme de formation",
  reglement_interieur: "Règlement intérieur",
  planning: "Planning",
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  evaluation_finale: "Évaluation finale",
  attestation_fin: "Attestation de fin de formation",
  certificat_realisation: "Certificat de réalisation",
  feuille_emargement: "Feuille d'émargement",
};

/** Nettoie une chaîne pour un nom de fichier (sans accents ni caractères spéciaux). */
function slug(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function nomFichier(piece: string, prenom?: string, nom?: string): string {
  const base = slug(LIBELLE[piece] ?? piece);
  const ident = slug(`${prenom ?? ""} ${nom ?? ""}`);
  return `${base}${ident ? "_" + ident : ""}.pdf`;
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let dossierId: string;
  try { ({ dossierId } = await req.json()); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  const f = fiche as unknown as { civilite?: string; nom: string; prenom?: string; email?: string; certif?: string };
  if (!f.email) {
    return NextResponse.json({ ok: false, status: "email_manquant", erreur: "Email du stagiaire manquant : impossible d'envoyer." }, { status: 409 });
  }

  // Pièces archivées : la version signée prime sur la générée (une pièce = une entrée).
  const { data: arch, error } = await supabaseAdmin
    .from("archives")
    .select("piece_type, variant, url")
    .eq("dossier_id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  if (!arch || arch.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun document archivé : générez d'abord les documents du dossier." }, { status: 409 });
  }
  const meilleure = new Map<string, { piece_type: string; variant: string; url: string }>();
  for (const a of arch as any[]) {
    const prev = meilleure.get(a.piece_type);
    if (!prev || (a.variant === "signe" && prev.variant !== "signe")) meilleure.set(a.piece_type, a);
  }

  // Télécharge chaque PDF archivé (une pièce illisible ne bloque pas les autres).
  const piecesJointes: PieceJointe[] = [];
  const inclus: string[] = [];
  for (const a of meilleure.values()) {
    try {
      const dl = await supabaseAdmin.storage.from(BUCKET).download(a.url);
      if (dl.error || !dl.data) continue;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      piecesJointes.push({ nom: nomFichier(a.piece_type, f.prenom, f.nom), contenu: buf });
      inclus.push(a.piece_type);
    } catch { /* on saute cette pièce */ }
  }
  if (piecesJointes.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun PDF lisible à joindre." }, { status: 409 });
  }

  // Repli drapeau : email désactivé → on ne casse rien, on signale.
  if (!EMAIL_ACTIF) {
    await journal("dossier", dossierId, "envoi_dossier_canal_inactif", { nb: piecesJointes.length }, u?.email ?? null);
    return NextResponse.json(
      { ok: false, status: "canal_inactif", erreur: "Envoi email désactivé : identifiants SMTP (SMTP_USER / SMTP_PASS) absents des variables d'environnement Vercel." },
      { status: 503 },
    );
  }

  const liste = inclus.map((p) => `<li>${LIBELLE[p] ?? p}</li>`).join("");
  const civ = f.civilite ? `${f.civilite} ` : "";
  const corps = `
    <p>Bonjour ${civ}${f.prenom ?? ""} ${f.nom},</p>
    <p>Vous trouverez ci-joint les documents relatifs à votre formation chez MYSTORY (lieu de formation : <strong>Gagny</strong>) :</p>
    <ul>${liste}</ul>
    <p>Pour toute question, il vous suffit de répondre à cet email.</p>
    <p>Bien cordialement,<br/>L'équipe MYSTORY Formation</p>`;
  const html = gabaritEmail("Vos documents de formation", corps);

  const res = await envoyerEmail({
    a: f.email,
    objet: "Vos documents de formation — MYSTORY",
    html,
    piecesJointes,
    entite: "dossier",
    entiteId: dossierId,
  });

  if (res.ok) {
    await journal("dossier", dossierId, "documents_envoyes_stagiaire", { nb: piecesJointes.length, pieces: inclus, email: f.email }, u?.email ?? null);
    return NextResponse.json({ ok: true, status: "envoye", nbDocuments: piecesJointes.length });
  }
  await journal("dossier", dossierId, "envoi_dossier_echec", { erreur: res.erreur, nb: piecesJointes.length }, u?.email ?? null);
  return NextResponse.json({ ok: false, status: "echec_email", erreur: res.erreur ?? "Envoi impossible." }, { status: 502 });
}
