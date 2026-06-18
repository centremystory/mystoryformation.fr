/**
 * MYSTORY — GET /api/utilisateurs : liste des comptes actifs (pour les menus d'assignation).
 * Accessible à tout staff connecté (noms + emails de collègues, non sensible).
 * Ne renvoie jamais de secret (pas de hash de mot de passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("utilisateurs")
    .select("id, nom, prenom, email")
    .eq("actif", true)
    .order("nom", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, utilisateurs: data ?? [] });
}
