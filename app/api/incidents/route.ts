/**
 * MYSTORY — /api/incidents (Tier 4 — surveillance des échecs)
 * GET   (équipe) ?tous=1 → incidents (non résolus par défaut).
 * PATCH (équipe) { id, resolu } → marque résolu / rouvre.
 * POST  (équipe / token n8n) { source?, titre, detail?, contexte? } → consigne un incident (ex. échec workflow n8n).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consignerIncident } from "@/lib/incidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function garde(req: NextRequest) {
  // Direction seule (consultation/résolution). Le token de service n8n (sans rôle) passe
  // pour POSTer un incident — filet de transition assuré par requireRole.
  try { return await requireRole(req, ["direction"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const tous = req.nextUrl.searchParams.get("tous") === "1";
  let q = supabaseAdmin.from("incidents_techniques").select("*").order("cree_le", { ascending: false }).limit(200);
  if (!tous) q = q.eq("resolu", false);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, incidents: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const resolu = b?.resolu !== false;
  const { error } = await supabaseAdmin.from("incidents_techniques")
    .update({ resolu, resolu_le: resolu ? new Date().toISOString() : null, resolu_par: resolu ? (u.email ?? null) : null })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const titre = String(b?.titre ?? "").trim();
  if (!titre) return NextResponse.json({ ok: false, erreur: "titre requis." }, { status: 400 });
  const source = ["email", "n8n", "systeme"].includes(b?.source) ? b.source : "n8n";
  await consignerIncident(source, titre, b?.detail ? String(b.detail) : null, b?.contexte ?? null);
  return NextResponse.json({ ok: true });
}
