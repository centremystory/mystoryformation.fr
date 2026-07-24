/**
 * MYSTORY — /api/ai/resumer (proxy IA pour n8n & CRM)
 * POST { texte, instruction? } → résumé via OpenRouter (clé serveur Vercel).
 * Auth : session (cookie) OU token de service n8n (Authorization: Bearer),
 * même patron que /api/incidents. Évite de dupliquer la clé OpenRouter dans n8n.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const cle = process.env.OPENROUTER_API_KEY;
  if (!cle) return NextResponse.json({ ok: false, erreur: "OPENROUTER_API_KEY manquante côté serveur." }, { status: 503 });
  const modele = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const texte = String(b?.texte ?? "").slice(0, 12000);
  if (!texte.trim()) return NextResponse.json({ ok: false, erreur: "texte requis." }, { status: 400 });
  const instruction = String(b?.instruction ?? "Résume ce texte en français, de façon concise.").slice(0, 2000);

  let r: Response;
  try {
    r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", "X-Title": "MYSTORY CRM AI" },
      body: JSON.stringify({ model: modele, temperature: 0.2, messages: [{ role: "system", content: instruction }, { role: "user", content: texte }] }),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: "Service IA injoignable : " + (e?.message || String(e)) }, { status: 502 });
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return NextResponse.json({ ok: false, erreur: `Erreur du service IA (${r.status}). ${t.slice(0, 200)}` }, { status: 502 });
  }
  const j = await r.json();
  const resume = j?.choices?.[0]?.message?.content || "";
  return NextResponse.json({ ok: true, resume });
}
