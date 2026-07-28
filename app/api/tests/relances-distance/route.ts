// app/api/tests/relances-distance/route.ts — Tests envoyés à distance, en attente de passation.
// Tests INITIAUX et FINAUX (lien e-mail envoyé, statut en_cours, pas encore passés). Pour la page
// de relance : relancer le lien + garder un commentaire de suivi jusqu'à la conversion.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  // Les DEUX phases (initial + final) : un test final non passé doit aussi pouvoir être relancé.
  const { data, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, civilite, nom, prenom, email, phase, niveau_vise, cree_le, commentaire_suivi")
    .eq("statut", "en_cours").not("email", "is", null)
    .order("cree_le", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const auj = Date.now();
  const tests = (data ?? []).map((e: any) => ({
    ...e,
    jours: e.cree_le ? Math.floor((auj - new Date(e.cree_le).getTime()) / 86400000) : null,
  }));
  return NextResponse.json({ ok: true, tests, total: tests.length });
}

// Enregistre le commentaire de suivi d'un test à distance (suivi jusqu'à conversion).
export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const commentaire = String(b?.commentaire ?? "").slice(0, 2000);
  const { error } = await supabaseAdmin.from("evaluations").update({ commentaire_suivi: commentaire || null }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("evaluation", id, "test_distance_commentaire", { longueur: commentaire.length }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
