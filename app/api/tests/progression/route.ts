/**
 * MYSTORY — Progression d'un élève : niveaux du dossier + dernières évaluations complètes (initial/final).
 * GET ?dossier= → { niveaux, initial, final }. Auth requise.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) { if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 }); throw e; }

  const dossier = (req.nextUrl.searchParams.get("dossier") ?? "").trim();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Dossier manquant." }, { status: 400 });

  const { data: d } = await supabaseAdmin
    .from("dossiers").select("niveau_initial, niveau_vise, niveau_atteint").eq("id", dossier).maybeSingle();

  const { data: evs } = await supabaseAdmin
    .from("evaluations")
    .select("phase, ce_sur10, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, complete_le")
    .eq("dossier_id", dossier).eq("statut", "complet")
    .order("complete_le", { ascending: false });

  const initial = (evs ?? []).find((e: any) => e.phase === "initial") ?? null;
  const final = (evs ?? []).find((e: any) => e.phase === "final") ?? null;

  return NextResponse.json({ ok: true, niveaux: d ?? null, initial, final });
}
