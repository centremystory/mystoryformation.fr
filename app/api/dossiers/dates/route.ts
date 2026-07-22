/**
 * MYSTORY — PATCH /api/dossiers/dates
 * Met à jour les dates de commande / formation d'un dossier, et permet d'accepter le devis
 * tout de suite (date acceptée = aujourd'hui + tunnel « validé »).
 * Body { dossierId, date_validation_commande?, date_debut?, date_fin?, date_entree_declaree?,
 *        date_acceptee?, accepter_maintenant? }. Champs de date : "YYYY-MM-DD" ou "" (efface).
 * Écriture équipe (requireUser). Journalisé. Aucune suppression de dossier.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAMPS_DATE = ["date_validation_commande", "date_debut", "date_fin", "date_entree_declaree", "date_acceptee"] as const;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

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

  const maj: Record<string, unknown> = {};
  for (const champ of CHAMPS_DATE) {
    if (!(champ in body)) continue; // non fourni → on ne touche pas
    const v = body[champ];
    if (v == null || String(v).trim() === "") { maj[champ] = null; continue; }
    const s = String(v).slice(0, 10);
    if (!RE_DATE.test(s)) return NextResponse.json({ ok: false, erreur: `Date invalide pour ${champ} (attendu AAAA-MM-JJ).` }, { status: 422 });
    maj[champ] = s;
  }

  // Cohérence début/fin si les deux sont posés dans la requête.
  if (typeof maj.date_debut === "string" && typeof maj.date_fin === "string" && maj.date_fin < maj.date_debut) {
    return NextResponse.json({ ok: false, erreur: "La date de fin ne peut pas précéder la date de début." }, { status: 422 });
  }

  // Accepter tout de suite : date acceptée = aujourd'hui (= devis validé) + tunnel « validé ».
  const accepter = body?.accepter_maintenant === true;
  if (accepter) {
    maj.date_acceptee = aujourdHuiParisISO();
    maj.statut_tunnel = "valide";
  }

  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ ok: false, erreur: "Aucune donnée à mettre à jour." }, { status: 400 });
  }

  const { data: d } = await supabaseAdmin.from("dossiers").select("id").eq("id", dossierId).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const { error } = await supabaseAdmin.from("dossiers").update(maj).eq("id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("dossier", dossierId, accepter ? "devis_accepte" : "dates_maj", maj, u.email ?? null);
  return NextResponse.json({ ok: true, ...maj });
}
