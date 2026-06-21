/**
 * MYSTORY — Upload d'un média (audio ou image) pour un test, dans le bucket public `qcm`.
 * POST FormData { file } → renvoie l'URL publique. Réservé direction/manager/formatrice.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["direction", "manager", "formatrice"] as const;
const EXT_OK = ["mp3", "m4a", "ogg", "wav", "png", "jpg", "jpeg", "webp"];
const MAX = 25 * 1024 * 1024; // 25 Mo

export async function POST(req: NextRequest) {
  try { await requireRole(req, ROLES); }
  catch (e) { if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 }); throw e; }

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, erreur: "Fichier requis." }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!EXT_OK.includes(ext)) return NextResponse.json({ ok: false, erreur: "Format accepté : mp3, m4a, ogg, wav, png, jpg, webp." }, { status: 422 });
  if (file.size > MAX) return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (max 25 Mo)." }, { status: 413 });

  const nomNettoye = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const chemin = `tests/${Date.now()}_${nomNettoye}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from("qcm").upload(chemin, bytes, {
    contentType: file.type || "application/octet-stream", upsert: false,
  });
  if (error) return NextResponse.json({ ok: false, erreur: "Upload impossible." }, { status: 502 });

  const { data: pub } = supabaseAdmin.storage.from("qcm").getPublicUrl(chemin);
  return NextResponse.json({ ok: true, url: pub.publicUrl, path: chemin });
}
