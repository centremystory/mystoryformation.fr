// app/api/tests/relances-distance/route.ts — Tests initiaux envoyés à distance, en attente de passation.
// (lien e-mail envoyé, statut en_cours, pas encore passé). Pour la page de relance.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, civilite, nom, prenom, email, phase, niveau_vise, cree_le")
    .neq("phase", "final").eq("statut", "en_cours").not("email", "is", null)
    .order("cree_le", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const auj = Date.now();
  const tests = (data ?? []).map((e: any) => ({
    ...e,
    jours: e.cree_le ? Math.floor((auj - new Date(e.cree_le).getTime()) / 86400000) : null,
  }));
  return NextResponse.json({ ok: true, tests, total: tests.length });
}
