/**
 * MYSTORY — GET /api/positionnements  (auth)
 * Liste les positionnements en attente de notation par la formatrice.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("positionnements")
    .select("token, civilite, nom, prenom, certif, niveau_vise, ce_sur20, co_sur10, created_at")
    .eq("statut", "en_attente_formateur")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  return NextResponse.json({ ok: true, liste: data ?? [] });
}
