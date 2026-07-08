/**
 * MYSTORY — /api/seances-accueil
 * Séances d'ACCUEIL hors financement (gratuites, avant le début de la formation).
 * Suivi de présence INTERNE uniquement, pour la visibilité de l'équipe.
 *
 * ISOLATION STRICTE (conformité) : ces séances ne sont JAMAIS lues par la conformité EDOF,
 * le calcul d'heures réalisées / la clôture, la feuille d'émargement, la fiche EDOF, ni
 * l'export ZIP d'audit. Aucun document stagiaire n'en découle. Pas de delete = actif=false.
 * Horodatage serveur (cree_le = now()) — pas d'antidate.
 *
 * GET  ?dossier=<uuid> | ?stagiaire=<uuid>  → séances actives + compteurs
 * POST { dossierId, stagiaireId?, dateSeance?, present?, note? }
 * PATCH { id, action:"archiver" } | { id, present?, note?, dateSeance? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function auth(req: NextRequest) {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });

  const dossier = req.nextUrl.searchParams.get("dossier")?.trim();
  const stagiaire = req.nextUrl.searchParams.get("stagiaire")?.trim();
  if (!dossier && !stagiaire) return NextResponse.json({ ok: false, erreur: "Paramètre dossier ou stagiaire requis." }, { status: 400 });

  let q = supabaseAdmin
    .from("seances_accueil")
    .select("id, dossier_id, stagiaire_id, date_seance, present, note, auteur, cree_le")
    .eq("actif", true)
    .order("date_seance", { ascending: false });
  if (dossier) q = q.eq("dossier_id", dossier);
  else if (stagiaire) q = q.eq("stagiaire_id", stagiaire);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const seances = data ?? [];
  const presents = seances.filter((s) => s.present).length;
  return NextResponse.json({ ok: true, seances, total: seances.length, presents });
}

export async function POST(req: NextRequest) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossierId ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  // stagiaire_id : fourni, sinon déduit du dossier
  let stagiaireId = String(body?.stagiaireId ?? "").trim() || null;
  if (!stagiaireId) {
    const { data: d } = await supabaseAdmin.from("dossiers").select("stagiaire_id").eq("id", dossierId).maybeSingle();
    stagiaireId = d?.stagiaire_id ?? null;
  }

  const dateSeance = String(body?.dateSeance ?? "").trim() || null; // null → défaut DB (jour Paris)
  const present = body?.present === false ? false : true;
  const note = String(body?.note ?? "").trim() || null;

  const row: Record<string, unknown> = { dossier_id: dossierId, stagiaire_id: stagiaireId, present, note, auteur: u.email ?? null };
  if (dateSeance) row.date_seance = dateSeance;

  const { data, error } = await supabaseAdmin.from("seances_accueil").insert(row).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("dossier", dossierId, "seance_accueil_ajoutee", { present, date_seance: dateSeance ?? "auto" }, u.email ?? null);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const u = await auth(req);
  if (!u) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (body?.action === "archiver") {
    const { data, error } = await supabaseAdmin.from("seances_accueil").update({ actif: false }).eq("id", id).select("dossier_id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("dossier", data?.dossier_id ?? id, "seance_accueil_archivee", { id }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body?.present === "boolean") patch.present = body.present;
  if (typeof body?.note === "string") patch.note = body.note.trim() || null;
  if (typeof body?.dateSeance === "string" && body.dateSeance.trim()) patch.date_seance = body.dateSeance.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à modifier." }, { status: 400 });

  const { error } = await supabaseAdmin.from("seances_accueil").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
