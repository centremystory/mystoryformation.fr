/**
 * MYSTORY — /api/livret-suivi  (données saisies du livret de suivi digitalisé)
 *  GET  ?dossier=<id>          → { ok, donnees } (JSON des champs formatrice).
 *  PUT  { dossierId, donnees } → enregistre (upsert). Auth équipe.
 * Le reste du livret (couverture, positionnement, séances, résultats) est auto-dérivé
 * du CRM par lib/livretSuivi.ts ; ici on ne stocke QUE la saisie formatrice.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const dossierId = (req.nextUrl.searchParams.get("dossier") ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "Paramètre « dossier » requis." }, { status: 400 });
  const { data } = await supabaseAdmin.from("livrets_suivi").select("donnees").eq("dossier_id", dossierId).maybeSingle();
  // Séances du planning (pour afficher dates + créneaux dans la saisie « ce que j'ai travaillé »).
  const { data: seances } = await supabaseAdmin.from("planning")
    .select("date_seance, demi_journee").eq("dossier_id", dossierId)
    .order("date_seance", { ascending: true }).order("demi_journee", { ascending: true });
  return NextResponse.json({ ok: true, donnees: (data as any)?.donnees ?? {}, seances: seances ?? [] });
}

export async function PUT(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const dossierId = String(b?.dossierId ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });
  const donnees = (b?.donnees && typeof b.donnees === "object") ? b.donnees : {};

  const { error } = await supabaseAdmin.from("livrets_suivi").upsert(
    { dossier_id: dossierId, donnees, maj_le: new Date().toISOString(), maj_par: u.email ?? null },
    { onConflict: "dossier_id" },
  );
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
