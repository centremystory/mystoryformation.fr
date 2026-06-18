/**
 * MYSTORY — Émargement papier : dépôt et consultation du SCAN signé d'une journée.
 * POST (multipart) : date + fichier → upload bucket privé `documents` (emargements-papier/<date>/…),
 *   horodatage serveur (anti-antidate), remplacement = ancienne ligne actif=false + nouvelle.
 * GET (?date=YYYY-MM-DD) : URL signée 1 h vers le dernier scan actif. Pas de DELETE (traçabilité).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, erreur: "Date invalide." }, { status: 400 });
  }
  const { data } = await supabaseAdmin
    .from("emargements_papier")
    .select("fichier_url, fichier_nom, depose_le")
    .eq("date_jour", date).eq("actif", true)
    .order("depose_le", { ascending: false }).limit(1).maybeSingle();
  if (!data) return NextResponse.json({ ok: true, scan: null });
  const { data: signe } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.fichier_url, 3600);
  return NextResponse.json({ ok: true, scan: { url: signe?.signedUrl ?? null, nom: data.fichier_nom, depose_le: data.depose_le } });
}

export async function POST(req: NextRequest) {
  let user: any = null;
  try { user = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const form = await req.formData();
  const date = String(form.get("date") ?? "").trim();
  const file = form.get("fichier");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(file instanceof File)) {
    return NextResponse.json({ ok: false, erreur: "Date (YYYY-MM-DD) et fichier requis." }, { status: 400 });
  }
  if (!TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, erreur: "Format non accepté — PDF, JPG ou PNG." }, { status: 415 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (10 Mo max)." }, { status: 413 });
  }

  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const chemin = `emargements-papier/${date}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(chemin, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ ok: false, erreur: upErr.message }, { status: 500 });

  // Remplacement : on désactive les scans actifs précédents du jour (jamais de suppression).
  await supabaseAdmin.from("emargements_papier").update({ actif: false }).eq("date_jour", date).eq("actif", true);

  const auteur = (user && (user.email || user.nom)) ? String(user.email || user.nom) : null;
  const { data, error } = await supabaseAdmin.from("emargements_papier")
    .insert({ date_jour: date, fichier_url: chemin, fichier_nom: (file as File).name || `emargement_${date}.${ext}`, depose_par: auteur, actif: true })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("emargements_papier", String((data as any).id), "depot_scan", { date_jour: date, fichier: chemin }, auteur);
  return NextResponse.json({ ok: true, id: (data as any).id });
}
