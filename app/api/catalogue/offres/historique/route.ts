/**
 * MYSTORY — /api/catalogue/offres/historique
 * GET  → liste des versions du catalogue (métadonnées, sans le snapshot complet).
 * POST { version_id } → RESTAURE cette version (remplace le catalogue courant).
 *        Snapshote d'abord l'état courant → la restauration est elle-même annulable.
 * Direction / management.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { snapshotCatalogue } from "@/lib/catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction / au management." }, { status: 403 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const { data, error } = await supabaseAdmin
    .from("offres_formules_versions")
    .select("id, cree_le, auteur, motif")
    .order("cree_le", { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, versions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const user = g as SessionUser;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const vid = String(b?.version_id ?? "").trim();
  if (!vid) return NextResponse.json({ ok: false, erreur: "version_id requis." }, { status: 400 });

  const { data: v, error: eV } = await supabaseAdmin
    .from("offres_formules_versions").select("snapshot").eq("id", vid).maybeSingle();
  if (eV) return NextResponse.json({ ok: false, erreur: eV.message }, { status: 500 });
  if (!v) return NextResponse.json({ ok: false, erreur: "Version introuvable." }, { status: 404 });
  const rows = Array.isArray(v.snapshot) ? v.snapshot : [];
  if (!rows.length) return NextResponse.json({ ok: false, erreur: "Version vide — restauration refusée." }, { status: 400 });

  // La restauration est annulable : on snapshote l'état courant avant de remplacer.
  await snapshotCatalogue(user?.nom || user?.email, "Avant restauration");

  // Remplace le catalogue : purge puis réinsertion du snapshot.
  const { error: eDel } = await supabaseAdmin.from("offres_formules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (eDel) return NextResponse.json({ ok: false, erreur: eDel.message }, { status: 500 });
  const { error: eIns } = await supabaseAdmin.from("offres_formules").insert(rows);
  if (eIns) return NextResponse.json({ ok: false, erreur: eIns.message }, { status: 500 });

  return NextResponse.json({ ok: true, restaurees: rows.length });
}
