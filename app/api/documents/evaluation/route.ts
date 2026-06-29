/**
 * MYSTORY — /api/documents/evaluation
 * Génère la pièce de conformité « Évaluation initiale/finale » du dossier à partir du
 * test réellement passé (moteur d'évaluations). Lecture du résultat → PDF archivé → pièce « générée ».
 * POST { dossierId, phase: "initial" | "final" }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { genererDocEvaluation } from "@/lib/evaluationDoc";
import { getSignedUrl } from "@/lib/crm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let email: string | null = null;
  try {
    const u = await requireUser(req);
    email = u.email ?? null;
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossierId ?? "").trim();
  const phase = String(body?.phase ?? "").trim();
  if (!dossierId || (phase !== "initial" && phase !== "final")) {
    return NextResponse.json({ ok: false, erreur: "dossierId et phase (initial | final) requis." }, { status: 400 });
  }

  const res = await genererDocEvaluation(dossierId, phase as "initial" | "final", email);
  if (!res.ok) return NextResponse.json({ ok: false, erreur: res.raison ?? "Génération impossible." }, { status: 409 });

  const piece = phase === "final" ? "evaluation_finale" : "evaluation_initiale";
  let pdfUrl: string | null = null;
  try { pdfUrl = await getSignedUrl(`${dossierId}/${piece}_genere.pdf`, 3600); } catch { pdfUrl = null; }

  return NextResponse.json({ ok: true, dossierId, phase, status: "genere", pdfUrl });
}
