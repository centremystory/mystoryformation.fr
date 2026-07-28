// app/api/tests/liste/route.ts — Tous les tests (initiaux + finaux) faits par les stagiaires.
// Vue d'ensemble consultable + recherche + accès au PDF détaillé. Lecture seule.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);

  const lignes = await fetchAllRows<any>((from, to) => supabaseAdmin
    .from("evaluations")
    .select("id, phase, statut, niveau_vise, niveau_global, total_sur20, ce_sur10, co_sur10, ee_sur10, eo_sur10, complete_le, dossier:dossiers!dossier_id ( id, certif, stagiaire:stagiaires!stagiaire_id ( nom, prenom, agence ) )")
    .order("complete_le", { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, to));

  const tests = lignes
    .map((e: any) => {
      const s = e.dossier?.stagiaire;
      return {
        id: e.id,
        phase: e.phase, // "initial" | "final"
        statut: e.statut,
        niveau_vise: e.niveau_vise,
        niveau_global: e.niveau_global,
        total_sur20: e.total_sur20,
        ce: e.ce_sur10, co: e.co_sur10, ee: e.ee_sur10, eo: e.eo_sur10,
        complete_le: e.complete_le,
        dossier_id: e.dossier?.id ?? null,
        certif: e.dossier?.certif ?? null,
        nom: `${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim() || "—",
        agence: s?.agence ?? null,
      };
    })
    .filter((t: any) => !site || t.agence === site);

  return NextResponse.json({ ok: true, total: tests.length, tests });
}
