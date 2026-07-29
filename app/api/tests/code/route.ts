/**
 * MYSTORY — GET /api/tests/code?c=CODE : résout un code court (remis au stagiaire) vers le jeton
 * du test à passer. PUBLIC (rate-limité) — utilisé par /test/finale pour la saisie manuelle du code.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (await limiteDepassee(`test-code:${ipDe(req)}`, 20, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives, réessayez plus tard." }, { status: 429 });
  }
  const brut = String(req.nextUrl.searchParams.get("c") ?? "").trim().toUpperCase();
  // Tolère la saisie avec ou sans tiret / espaces.
  const compact = brut.replace(/[\s-]/g, "");
  const code = compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : brut;
  if (!code) return NextResponse.json({ ok: false, erreur: "Code manquant." }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("evaluations")
    .select("token, statut")
    .eq("code", code)
    .order("cree_le", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.token) return NextResponse.json({ ok: false, erreur: "Code invalide ou expiré." }, { status: 404 });
  return NextResponse.json({ ok: true, token: data.token });
}
