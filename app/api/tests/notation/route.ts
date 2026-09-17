/**
 * MYSTORY — Notation formatrice d'un test (expression écrite + orale).
 * GET  : liste des tests en attente de notation (auth pédagogique).
 * POST : { id, ee_sur10, eo_sur10, remarques? } → délègue à lib/noterEvaluation.ts.
 *
 * 17/09/2026 — le calcul du niveau, la pièce Qualiopi et les e-mails ont été sortis
 * d'ici : la formatrice peut aussi noter depuis le lien signé reçu par e-mail
 * (app/tests/corriger/[id]), et les deux chemins doivent produire le même résultat.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError } from "@/lib/auth";
import { noterEvaluation, echecNotation } from "@/lib/noterEvaluation";
import { urlDeBase } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le PDF de correction est rendu par Chromium avant l'envoi de l'e-mail interne :
// la notation dure plus longtemps qu'un simple UPDATE.
export const maxDuration = 60;

const ROLES_NOTE = ["direction", "manager", "formatrice", "back_office"] as const;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireRole(req, ROLES_NOTE); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  const { data: evs } = await supabaseAdmin
    .from("evaluations")
    .select("id, phase, test_id, dossier_id, nom, prenom, email, ce_sur10, co_sur10, ecrit, sujet_ecrit, oral_audios, cree_le")
    .eq("statut", "en_attente_formateur")
    .order("cree_le", { ascending: true });

  const testIds = [...new Set((evs ?? []).map((e: any) => e.test_id))];
  const testsMap = new Map<string, any>();
  if (testIds.length) {
    const { data: ts } = await supabaseAdmin.from("tests").select("id, titre, phase, consigne_ecrit, consigne_oral").in("id", testIds);
    (ts ?? []).forEach((t: any) => testsMap.set(t.id, t));
  }
  const evaluations = [];
  for (const e of (evs ?? []) as any[]) {
    const oa = Array.isArray(e.oral_audios) ? e.oral_audios : [];
    const oral: Array<{ q: number; question: string; url: string | null; duree: number | null }> = [];
    for (const a of oa) {
      let url: string | null = null;
      try { const { data: signed } = await supabaseAdmin.storage.from("documents").createSignedUrl(a.chemin, 3600); url = signed?.signedUrl ?? null; } catch { url = null; }
      oral.push({ q: a.q, question: a.question, url, duree: a.duree ?? null });
    }
    evaluations.push({ ...e, test: testsMap.get(e.test_id) ?? null, oral });
  }
  return NextResponse.json({ ok: true, evaluations });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ROLES_NOTE); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  const r = await noterEvaluation({
    id: String(body.id ?? "").trim(),
    ee: Number(body.ee_sur10),
    eo: Number(body.eo_sur10),
    remarques: body.remarques,
    oral_evaluation_mode: body.oral_evaluation_mode,
    oral_level_estimated: body.oral_level_estimated,
    oral_strengths: body.oral_strengths,
    oral_improvement_areas: body.oral_improvement_areas,
    oral_recommendation: body.oral_recommendation,
    oral_examiner_comment: body.oral_examiner_comment,
    notateur: u.email ?? null,
    urlBase: urlDeBase(req),
  });
  if (echecNotation(r)) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: r.code });
  return NextResponse.json(r);
}
