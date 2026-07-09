/**
 * MYSTORY — Passation d'un test (initial ou final), accès PUBLIC par jeton.
 * GET  ?token=… : renvoie le test + questions SANS les corrigés (bonne_reponse / mots_cles exclus).
 * POST          : reçoit les réponses, corrige CE/CO CÔTÉ SERVEUR, enregistre, passe en attente de notation.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { niveauFromSur20 } from "@/lib/tests";
import { corrigerAuto, type QuestionCorrige } from "@/lib/tests";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });

  const { data: ev, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, phase, statut, nom, prenom")
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  if (ev.statut === "annule") return NextResponse.json({ ok: false, erreur: "Ce test a été annulé." }, { status: 410 });
  if (ev.statut !== "en_cours") return NextResponse.json({ ok: false, erreur: "Ce test a déjà été envoyé. Merci !", dejaFait: true }, { status: 409 });

  const { data: test } = await supabaseAdmin
    .from("tests").select("titre, phase, consigne_ecrit, consigne_oral, oral_questions, sujets_ecrit").eq("id", ev.test_id).maybeSingle();

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("id, section, ordre, bloc, type, contexte, audio_path, enonce, options, points")
    .eq("test_id", ev.test_id).eq("actif", true)
    .order("section", { ascending: true })
    .order("ordre", { ascending: true });

  return NextResponse.json({
    ok: true,
    test: test ?? { titre: "Test", phase: ev.phase, consigne_ecrit: null, consigne_oral: null, oral_questions: null, sujets_ecrit: null },
    candidat: { nom: ev.nom, prenom: ev.prenom },
    questions: qs ?? [],
  });
}

export async function POST(req: NextRequest) {
  // Anti-spam / anti-bruteforce de jeton : dépôt public d'un test par jeton.
  if (await limiteDepassee(`passation:${ipDe(req)}`, 60, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop d'envois. Réessayez plus tard." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  const reponses = (body.reponses && typeof body.reponses === "object") ? body.reponses as Record<string, string> : {};
  const ecrit = body.ecrit == null ? null : String(body.ecrit).trim().slice(0, 8000) || null;
  const sujetEcrit = ["A1", "A2", "B1", "B2"].includes(String(body.sujet_ecrit)) ? String(body.sujet_ecrit) : null;

  const { data: ev, error } = await supabaseAdmin
    .from("evaluations").select("id, test_id, statut").eq("token", token).maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  if (ev.statut !== "en_cours") return NextResponse.json({ ok: false, erreur: "Ce test a déjà été envoyé." }, { status: 409 });

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("id, section, type, bonne_reponse, mots_cles, points")
    .eq("test_id", ev.test_id).eq("actif", true);

  const questions: QuestionCorrige[] = (qs ?? []).map((q: any) => ({
    id: q.id, section: q.section, type: q.type,
    bonne_reponse: q.bonne_reponse, mots_cles: q.mots_cles, points: q.points ?? 1,
  }));
  const { ceSur10, coSur10 } = corrigerAuto(questions, reponses);

  const { error: e2 } = await supabaseAdmin.from("evaluations").update({
    reponses, ce_sur10: ceSur10, co_sur10: coSur10, ecrit, sujet_ecrit: sujetEcrit,
    statut: "en_attente_formateur",
  }).eq("id", ev.id);
  if (e2) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });

  await journal("evaluation", ev.id, "test_soumis", { ce_sur10: ceSur10, co_sur10: coSur10 }, "candidat");
  return NextResponse.json({ ok: true, niveau_provisoire: niveauFromSur20(Number(ceSur10 ?? 0) + Number(coSur10 ?? 0)) });
}
