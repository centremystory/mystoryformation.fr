/**
 * MYSTORY — /api/positionnement/[token]  (PUBLIC par jeton : notation formatrice)
 *  GET  : charge le positionnement (identité + CE/CO) pour l'écran de notation.
 *  POST : enregistre EE + EO (0-10) → calcule le niveau → statut "complet"
 *         (le pont A3 crée alors le stagiaire + le dossier).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT =
  "id, certif, civilite, nom, prenom, email, telephone, niveau_vise, ce_sur20, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, remarques, statut, dossier_id, created_at";

function niveauFromSur20(n: number): string {
  if (n <= 4) return "A0";
  if (n <= 9) return "A1";
  if (n <= 14) return "A2";
  if (n <= 18) return "B1";
  return "B2";
}
function num(v: unknown, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > max) return null;
  return n;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin.from("positionnements").select(SELECT).eq("token", params.token).maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!data) return NextResponse.json({ ok: false, erreur: "Positionnement introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true, positionnement: data });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const ee = num(b.ee_sur10, 10), eo = num(b.eo_sur10, 10);
  if (ee == null || eo == null) return NextResponse.json({ ok: false, erreur: "Notes EE et EO requises (0 à 10)." }, { status: 422 });
  const remarques = b.remarques == null ? null : (String(b.remarques).trim().slice(0, 4000) || null);

  const { data: cur, error: e1 } = await supabaseAdmin
    .from("positionnements").select("id, ce_sur20, co_sur10, statut").eq("token", params.token).maybeSingle();
  if (e1) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!cur) return NextResponse.json({ ok: false, erreur: "Positionnement introuvable." }, { status: 404 });
  if (cur.ce_sur20 == null || cur.co_sur10 == null)
    return NextResponse.json({ ok: false, erreur: "Notes CE/CO absentes : niveau incalculable." }, { status: 409 });

  const tot40 = Number(cur.ce_sur20) / 2 + Number(cur.co_sur10) + ee + eo;
  const tot20 = Math.round((tot40 / 2) * 10) / 10;
  const niveau = niveauFromSur20(tot20);

  const { data: upd, error: e2 } = await supabaseAdmin.from("positionnements").update({
    ee_sur10: ee, eo_sur10: eo, remarques, total_sur20: tot20, niveau_global: niveau, statut: "complet",
  }).eq("token", params.token).select("id, niveau_global, total_sur20, statut, dossier_id").single();
  if (e2 || !upd) return NextResponse.json({ ok: false, erreur: "Mise à jour impossible." }, { status: 502 });

  return NextResponse.json({
    ok: true, niveau_global: upd.niveau_global, total_sur20: upd.total_sur20,
    statut: upd.statut, dossier_cree: !!upd.dossier_id,
  });
}
