/**
 * MYSTORY — PATCH /api/dossiers/tunnel
 * Fait avancer (ou réinitialise) l'étape du tunnel d'inscription d'un dossier.
 * Body { dossierId, statut_tunnel } — statut_tunnel parmi les 6 valeurs ou null (hors tunnel).
 * Lecture/écriture équipe. Journalisé. Aucune suppression.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ETAPES = [
  "devis_demande",
  "devis_participation_payee",
  "courrier_identite_envoye",
  "validation_numerique_demandee",
  "compte_identite_a_creer",
  "valide",
] as const;

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossierId ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  const brut = body?.statut_tunnel == null ? null : String(body.statut_tunnel).trim();
  const statut_tunnel = brut === null || brut === "" ? null : brut;
  if (statut_tunnel !== null && !ETAPES.includes(statut_tunnel as (typeof ETAPES)[number])) {
    return NextResponse.json({ ok: false, erreur: "Étape de tunnel invalide." }, { status: 400 });
  }

  const { data: d } = await supabaseAdmin.from("dossiers").select("id").eq("id", dossierId).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const { error } = await supabaseAdmin.from("dossiers").update({ statut_tunnel }).eq("id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("dossier", dossierId, "tunnel_maj", { statut_tunnel }, u.email ?? null);
  return NextResponse.json({ ok: true, statut_tunnel });
}
