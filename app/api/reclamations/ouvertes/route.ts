// app/api/reclamations/ouvertes/route.ts — Réclamations candidats à traiter (non résolues).
// Sert au bandeau d'alerte : elles doivent être visibles pour être traitées (Qualiopi).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("reclamations")
    .select("id, objet, candidat_nom, candidat_prenom, priorite, agence, statut, cree_le")
    .eq("actif", true).neq("statut", "resolue")
    .order("cree_le", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const items = data ?? [];
  const urgentes = items.filter((r: any) => /haute|urgent|elev|élev/i.test(String(r.priorite ?? ""))).length;
  return NextResponse.json({
    ok: true,
    total: items.length,
    urgentes,
    apercu: items.slice(0, 3).map((r: any) => (r.objet || `${r.candidat_prenom ?? ""} ${r.candidat_nom ?? ""}`.trim() || "Réclamation")),
  });
}
