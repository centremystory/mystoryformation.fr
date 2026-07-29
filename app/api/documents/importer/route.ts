/**
 * MYSTORY — POST /api/documents/importer  (pièce faite MANUELLEMENT hors CRM)
 * Dépôt du PDF (ou scan) d'une pièce du dossier réalisée à la main : document imprimé,
 * signé sur papier puis scanné. Le fichier importé devient la version qui FAIT FOI
 * (variante « signe », prioritaire sur « genere ») et la pièce passe en « signee ».
 * Alternative au circuit Générer / DocuSeal quand l'équipe préfère le papier.
 *
 * PDF / JPG / PNG, 10 Mo max. Bucket privé, URL signée à la lecture.
 * Protégé par le middleware (mot de passe d'équipe) + requireUser.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { setPieceStatus } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES_ACCEPTES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Pièces du dossier réalisables à la main (ordre = pour créer la ligne si absente).
const PIECES: Record<string, number> = {
  fiche_analyse_besoin: 1,
  evaluation_initiale: 2,
  convention: 3,
  programme: 4,
  reglement_interieur: 5,
  planning: 6,
  convocation: 7,
  feuille_emargement: 8,
  evaluation_finale: 9,
  satisfaction_chaud: 10,
  attestation_fin: 11,
  certificat_realisation: 12,
};

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, erreur: "Formulaire invalide." }, { status: 400 }); }

  const dossierId = String(form.get("dossierId") ?? "").trim();
  const piece = String(form.get("piece") ?? "").trim();
  const fichier = form.get("fichier");

  if (!dossierId || !(piece in PIECES) || !(fichier instanceof File)) {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : dossierId, piece (pièce du dossier) et fichier." }, { status: 400 });
  }
  const ext = TYPES_ACCEPTES[fichier.type];
  if (!ext) return NextResponse.json({ ok: false, erreur: "Format non accepté — PDF, JPG ou PNG uniquement." }, { status: 415 });
  if (fichier.size > MAX_SIZE) return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (10 Mo maximum)." }, { status: 413 });

  const { data: dossier } = await supabaseAdmin.from("dossiers").select("id").eq("id", dossierId).maybeSingle();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  // Crée la ligne de pièce si absente (dossiers récents la portent déjà).
  const { data: ligne } = await supabaseAdmin
    .from("pieces").select("type").eq("dossier_id", dossierId).eq("type", piece).maybeSingle();
  if (!ligne) {
    await supabaseAdmin.from("pieces").insert({
      dossier_id: dossierId, type: piece, ordre: PIECES[piece],
      optionnelle: false, statut: "manquant", exige_signature: false,
    });
  }

  // Un seul fichier « signé » vivant par pièce : on remplace les extensions précédentes.
  const chemins = Object.values(TYPES_ACCEPTES).map((e) => `${dossierId}/${piece}_signe.${e}`);
  await supabaseAdmin.storage.from(BUCKET).remove(chemins).catch(() => {});

  const chemin = `${dossierId}/${piece}_signe.${ext}`;
  const bytes = Buffer.from(await fichier.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET).upload(chemin, bytes, { contentType: fichier.type, upsert: true });
  if (upErr) return NextResponse.json({ ok: false, erreur: `Échec de l'envoi : ${upErr.message}` }, { status: 500 });

  const { error: archErr } = await supabaseAdmin.from("archives").upsert(
    { dossier_id: dossierId, piece_type: piece, variant: "signe", url: chemin, generated_at: new Date().toISOString() },
    { onConflict: "dossier_id,piece_type,variant" },
  );
  if (archErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
    return NextResponse.json({ ok: false, erreur: archErr.message }, { status: 500 });
  }

  await setPieceStatus({ dossierId, piece, status: "signee", at: new Date().toISOString() });
  await journal("dossier", dossierId, "piece_importee_manuelle", { piece }, u.email ?? null);
  return NextResponse.json({ ok: true, dossierId, piece, status: "signee" });
}
