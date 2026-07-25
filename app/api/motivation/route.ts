// app/api/motivation/route.ts — Message de motivation du jour (IA), généré UNE fois par
// créneau (matin/aprem) et mis en cache dans messages_motivation → pas d'appel IA à chaque page.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 });
    throw e;
  }
  const creneau = new URL(req.url).searchParams.get("creneau") === "aprem" ? "aprem" : "matin";
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

  const { data: exist } = await supabaseAdmin
    .from("messages_motivation").select("message").eq("jour", jour).eq("creneau", creneau).maybeSingle();
  if (exist?.message) return NextResponse.json({ ok: true, message: exist.message });

  const secours = creneau === "matin"
    ? "Nouvelle journée, nouvelles histoires à écrire — on donne le meilleur 💪"
    : "C'est l'après-midi qu'on fait la différence, on lâche rien 🚀";
  const cle = process.env.OPENROUTER_API_KEY;
  if (!cle) return NextResponse.json({ ok: true, message: secours });

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", "X-Title": "MYSTORY Motivation" },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0.9, max_tokens: 60,
        messages: [
          { role: "system", content: "Tu écris UN court message de motivation pour l'équipe de MYSTORY Formation (centre de formation FLE et d'examen TEF IRN). Une seule phrase, max 18 mots, en français, chaleureux, positif, exactement 1 emoji à la fin. Varie les angles selon les jours : fierté du travail, esprit d'équipe, et SURTOUT la réussite des élèves — des élèves comptent sur vous, leur réussite est entre vos mains, donnez le maximum. Esprit du slogan interne « Développer l'histoire de MYSTORY est notre priorité » et de marque « Votre histoire, notre fierté ». Pas de guillemets, pas de préambule." },
          { role: "user", content: creneau === "matin" ? "Message pour bien démarrer la matinée." : "Message pour relancer l'énergie en début d'après-midi." },
        ],
      }),
    });
    const j = await r.json();
    const msg = String(j?.choices?.[0]?.message?.content || "").trim().replace(/^["«\s]+|["»\s]+$/g, "") || secours;
    await supabaseAdmin.from("messages_motivation").upsert({ jour, creneau, message: msg }, { onConflict: "jour,creneau", ignoreDuplicates: true });
    return NextResponse.json({ ok: true, message: msg });
  } catch {
    return NextResponse.json({ ok: true, message: secours });
  }
}
