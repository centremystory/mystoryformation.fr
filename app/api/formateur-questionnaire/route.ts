/**
 * MYSTORY — /api/formateur-questionnaire  (6c — réponses formateur, accès public par jeton)
 * GET  ?token=  → valide le jeton, renvoie le nom du formateur + si déjà répondu.
 * POST { token, reponses } → enregistre les réponses (immuable : une seule fois par formateur).
 * Le jeton (uuid non devinable) est la capability ; vérifié côté serveur. Pas d'auth de session.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function formateurParToken(token: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  const { data } = await supabaseAdmin
    .from("formateurs").select("id, civilite, prenom, nom, actif").eq("token", token).maybeSingle();
  if (!data || !(data as any).actif) return null;
  return data as any;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const f = await formateurParToken(token);
  if (!f) return NextResponse.json({ ok: false, erreur: "Lien invalide ou expiré." }, { status: 404 });
  const { data: rep } = await supabaseAdmin.from("formateur_questionnaire").select("id").eq("formateur_id", f.id).maybeSingle();
  return NextResponse.json({
    ok: true,
    formateur: { prenom: f.prenom, nom: f.nom, civilite: f.civilite },
    dejaRepondu: !!rep,
  });
}

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const token = String(b?.token ?? "");
  const reponses = b?.reponses;
  const f = await formateurParToken(token);
  if (!f) return NextResponse.json({ ok: false, erreur: "Lien invalide ou expiré." }, { status: 404 });
  if (!reponses || typeof reponses !== "object") return NextResponse.json({ ok: false, erreur: "Réponses requises." }, { status: 400 });

  // Immuable : une seule réponse par formateur.
  const { data: exist } = await supabaseAdmin.from("formateur_questionnaire").select("id").eq("formateur_id", f.id).maybeSingle();
  if (exist) return NextResponse.json({ ok: false, erreur: "Questionnaire déjà rempli. Merci !" }, { status: 409 });

  const { error } = await supabaseAdmin.from("formateur_questionnaire").insert({ formateur_id: f.id, reponses });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("formateur", f.id, "formateur_questionnaire_rempli", {}, "formateur (questionnaire)");
  return NextResponse.json({ ok: true });
}
