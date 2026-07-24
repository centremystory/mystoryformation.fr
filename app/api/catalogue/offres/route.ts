/**
 * MYSTORY — /api/catalogue/offres (catalogue v4 éditable : offres + formules)
 * GET (direction/manager) → liste des formules v4. PATCH → édite une formule.
 * Table offres_formules (séparée du tunnel de vente — brouillon jusqu'à validation certificateur).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function garde(req: NextRequest) {
  try { return await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction / au management." }, { status: 403 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const { data, error } = await supabaseAdmin.from("offres_formules").select("*").order("offre_id").order("ordre");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, formules: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const maj: any = { maj_le: new Date().toISOString() };
  if (b.formule_nom != null) maj.formule_nom = String(b.formule_nom).slice(0, 80);
  if (b.offre_intitule != null) maj.offre_intitule = String(b.offre_intitule).slice(0, 200);
  if (b.heures != null) { const h = parseInt(String(b.heures), 10); if (!isNaN(h)) maj.heures = h; }
  if (b.seances != null) { const s = parseInt(String(b.seances), 10); maj.seances = isNaN(s) ? null : s; }
  if (b.prix_eur != null) { const p = Number(b.prix_eur); if (!isNaN(p)) maj.prix_eur = p; }
  if (b.statut != null && ["brouillon", "valide"].includes(String(b.statut))) maj.statut = String(b.statut);
  if (typeof b.actif === "boolean") maj.actif = b.actif;

  // Garde-fou plafond
  if (maj.prix_eur != null && maj.prix_eur > 1600) return NextResponse.json({ ok: false, erreur: "Prix > 1 600 € interdit (plafond CPF)." }, { status: 400 });

  const { error } = await supabaseAdmin.from("offres_formules").update(maj).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
