/**
 * MYSTORY — /api/documents/evaluation
 * Génère la pièce de conformité « Évaluation initiale/finale » du dossier à partir du
 * test réellement passé (moteur d'évaluations). Lecture du résultat → PDF archivé → pièce « générée ».
 * POST { dossierId, phase: "initial" | "final" }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { genererDocEvaluation, genererDocEvaluationManuelle } from "@/lib/evaluationDoc";
import { getSignedUrl } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  // Mode SAISIE MANUELLE (test papier / évaluation à la main) : scores + niveau fournis.
  const manuel = body?.manuel;
  if (manuel) {
    const NIVEAUX = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
    const niveauG = String(manuel.niveau_global ?? "");
    if (!NIVEAUX.includes(niveauG)) return NextResponse.json({ ok: false, erreur: "Niveau global à renseigner (A0 → C2)." }, { status: 422 });
    const ce = Number(manuel.ce_sur10), co = Number(manuel.co_sur10), ee = Number(manuel.ee_sur10), eo = Number(manuel.eo_sur10);
    for (const [lbl, val] of [["CE", ce], ["CO", co], ["EE", ee], ["EO", eo]] as const) {
      if (!(val >= 0 && val <= 10)) return NextResponse.json({ ok: false, erreur: `Score ${lbl} doit être compris entre 0 et 10.` }, { status: 422 });
    }
    const remarques = manuel.remarques == null ? null : (String(manuel.remarques).trim().slice(0, 4000) || null);
    const resM = await genererDocEvaluationManuelle(dossierId, phase as "initial" | "final", { ce, co, ee, eo, niveau_global: niveauG, remarques }, email);
    if (!resM.ok) return NextResponse.json({ ok: false, erreur: resM.raison ?? "Génération impossible." }, { status: 409 });
    // Le niveau saisi devient LE niveau du dossier (une seule source de vérité).
    const champ = phase === "final" ? "niveau_atteint" : "niveau_initial";
    await supabaseAdmin.from("dossiers").update({ [champ]: niveauG }).eq("id", dossierId);
    const pieceM = phase === "final" ? "evaluation_finale" : "evaluation_initiale";
    let urlM: string | null = null;
    try { urlM = await getSignedUrl(`${dossierId}/${pieceM}_genere.pdf`, 3600); } catch { urlM = null; }
    return NextResponse.json({ ok: true, dossierId, phase, status: "genere", pdfUrl: urlM, manuel: true });
  }

  const res = await genererDocEvaluation(dossierId, phase as "initial" | "final", email);
  if (!res.ok) return NextResponse.json({ ok: false, erreur: res.raison ?? "Génération impossible." }, { status: 409 });

  const piece = phase === "final" ? "evaluation_finale" : "evaluation_initiale";
  let pdfUrl: string | null = null;
  try { pdfUrl = await getSignedUrl(`${dossierId}/${piece}_genere.pdf`, 3600); } catch { pdfUrl = null; }

  return NextResponse.json({ ok: true, dossierId, phase, status: "genere", pdfUrl });
}
