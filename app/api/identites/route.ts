/**
 * MYSTORY — Suivi des vérifications d'identité (accueil).
 * GET /api/identites?filtre=a_suivre|valides|non_renseignes|tous
 * Stagiaires ACTIFS uniquement. Lecture équipe (requireUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { IDENTITE_A_SUIVRE, IDENTITE_STATUTS } from "@/lib/identite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const filtre = req.nextUrl.searchParams.get("filtre") ?? "a_suivre";
  let q = supabaseAdmin
    .from("stagiaires")
    .select("id, civilite, nom, prenom, email, telephone, agence, verification_identite, verification_identite_note, verification_identite_maj_le, verification_identite_auteur, created_at")
    .eq("actif", true)
    .order("verification_identite_maj_le", { ascending: false, nullsFirst: false })
    .limit(300);

  if (filtre === "a_suivre") q = q.in("verification_identite", IDENTITE_A_SUIVRE);
  else if (filtre === "valides") q = q.in("verification_identite", IDENTITE_STATUTS.filter((s) => !IDENTITE_A_SUIVRE.includes(s)));
  else if (filtre === "non_renseignes") q = q.is("verification_identite", null);
  // "tous" : pas de filtre supplémentaire

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  return NextResponse.json({ ok: true, stagiaires: data ?? [] });
}
