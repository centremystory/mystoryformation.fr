/**
 * MYSTORY — Dépôt des enregistrements oraux du candidat (PUBLIC par jeton).
 * POST { token, audios:[{ q, question, audioBase64, duree? }] } → bucket privé `documents` + evaluations.oral_audios.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  try { if (await limiteDepassee(`oral:${ip}`, 60, 3600)) return NextResponse.json({ ok: false, erreur: "Trop d'envois." }, { status: 429 }); }
  catch { /* fail-open */ }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }
  const token = String(b.token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  const audios = Array.isArray(b.audios) ? b.audios : null;
  if (!audios || !audios.length) return NextResponse.json({ ok: false, erreur: "Aucun enregistrement." }, { status: 422 });
  if (audios.length > 6) return NextResponse.json({ ok: false, erreur: "Trop d'enregistrements." }, { status: 422 });

  const { data: ev } = await supabaseAdmin.from("evaluations").select("id, statut").eq("token", token).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  if (ev.statut !== "en_cours") return NextResponse.json({ ok: false, erreur: "Test déjà envoyé." }, { status: 409 });

  const stockes: Array<{ q: number; question: string; chemin: string; duree: number | null }> = [];
  for (let i = 0; i < audios.length; i++) {
    const a = audios[i] as any;
    const b64 = String(a?.audioBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) continue;
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 6 * 1024 * 1024) return NextResponse.json({ ok: false, erreur: "Enregistrement trop volumineux (max ~6 Mo)." }, { status: 413 });
    const q = Number.isFinite(Number(a?.q)) ? Number(a.q) : i;
    const chemin = `oral/eval/${ev.id}/q${q}.webm`;
    const { error } = await supabaseAdmin.storage.from("documents").upload(chemin, buf, { contentType: "audio/webm", upsert: true });
    if (error) return NextResponse.json({ ok: false, erreur: `Téléversement impossible : ${error.message}` }, { status: 502 });
    stockes.push({ q, question: String(a?.question ?? "").slice(0, 300), chemin, duree: a?.duree != null ? Number(a.duree) : null });
  }
  if (!stockes.length) return NextResponse.json({ ok: false, erreur: "Enregistrements vides." }, { status: 422 });

  await supabaseAdmin.from("evaluations").update({ oral_audios: stockes }).eq("id", ev.id);
  return NextResponse.json({ ok: true, nombre: stockes.length });
}
