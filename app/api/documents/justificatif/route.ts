/**
 * MYSTORY — POST /api/documents/justificatif  (pièces déposées, non générées)
 * Dépôt d'un fichier externe sur une pièce du dossier :
 *  - justificatif_participation : preuve du paiement de la participation forfaitaire CPF
 *    (ou de l'exonération demandeur d'emploi / abondement) — à conserver, règle CDC.
 *  - justificatif_examen : preuve du passage de l'examen (convocation honorée, attestation…).
 *
 * PDF/JPG/PNG, 10 Mo max. Le fichier est rangé dans les archives du dossier comme un
 * document généré (bucket privé, URL signée à la lecture), la pièce est créée si absente
 * (OPTIONNELLE : ces justificatifs ne bloquent pas la complétude socle) et passe en « généré ».
 * Protégé par le middleware (mot de passe d'équipe) + requireUser.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { setPieceStatus } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES_ACCEPTES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const DEPOSABLES: Record<string, { ordre: number }> = {
  justificatif_participation: { ordre: 14 },
  justificatif_examen: { ordre: 15 },
};

export async function POST(req: NextRequest) {
  try { await requireUser(req); }
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

  if (!dossierId || !DEPOSABLES[piece] || !(fichier instanceof File)) {
    return NextResponse.json(
      { ok: false, erreur: "Paramètres requis : dossierId, piece (justificatif_participation | justificatif_examen) et fichier." },
      { status: 400 },
    );
  }
  const ext = TYPES_ACCEPTES[fichier.type];
  if (!ext) return NextResponse.json({ ok: false, erreur: "Format non accepté — PDF, JPG ou PNG uniquement." }, { status: 415 });
  if (fichier.size > MAX_SIZE) return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (10 Mo maximum)." }, { status: 413 });

  const { data: dossier } = await supabaseAdmin.from("dossiers").select("id").eq("id", dossierId).maybeSingle();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  // La pièce est créée si absente — OPTIONNELLE (« si applicable » dans le dossier conforme).
  const { data: ligne } = await supabaseAdmin
    .from("pieces").select("type").eq("dossier_id", dossierId).eq("type", piece).maybeSingle();
  if (!ligne) {
    const { error: insErr } = await supabaseAdmin.from("pieces").insert({
      dossier_id: dossierId, type: piece, ordre: DEPOSABLES[piece].ordre,
      optionnelle: true, statut: "manquant", exige_signature: false,
    });
    if (insErr) return NextResponse.json({ ok: false, erreur: insErr.message }, { status: 500 });
  }

  // Un seul fichier vivant par pièce : on remplace (les extensions précédentes sont nettoyées).
  const chemins = Object.values(TYPES_ACCEPTES).map((e) => `${dossierId}/${piece}_genere.${e}`);
  await supabaseAdmin.storage.from(BUCKET).remove(chemins).catch(() => {});

  const chemin = `${dossierId}/${piece}_genere.${ext}`;
  const bytes = Buffer.from(await fichier.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET).upload(chemin, bytes, { contentType: fichier.type, upsert: true });
  if (upErr) return NextResponse.json({ ok: false, erreur: `Échec de l'envoi : ${upErr.message}` }, { status: 500 });

  // Archive (UPSERT sur la clé dossier/pièce/variant : un re-dépôt remplace, ne duplique pas)
  const { error: archErr } = await supabaseAdmin.from("archives").upsert(
    { dossier_id: dossierId, piece_type: piece, variant: "genere", url: chemin, generated_at: new Date().toISOString() },
    { onConflict: "dossier_id,piece_type,variant" },
  );
  if (archErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([chemin]); // jamais de fichier orphelin
    return NextResponse.json({ ok: false, erreur: archErr.message }, { status: 500 });
  }

  await setPieceStatus({ dossierId, piece, status: "genere", at: new Date().toISOString() });
  return NextResponse.json({ ok: true, dossierId, piece, status: "genere" });
}
