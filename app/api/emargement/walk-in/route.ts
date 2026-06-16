/**
 * MYSTORY — Walk-in (élève non planifié) sur l'émargement du jour.
 * GET  : liste des dossiers actifs (pour le sélecteur).
 * POST { dossierId, demi_journee, heures } : crée une séance `hors_planning = true`
 *        datée d'AUJOURD'HUI (Europe/Paris, anti-antidate) → elle apparaît dans la liste à émarger.
 * Lieu unique : Gagny. Auth équipe (comme les autres routes d'émargement).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parisToday(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, certif, statut, stagiaires:stagiaire_id (prenom, nom)")
    .neq("statut", "annule");
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });

  const dossiers = (data ?? []).map((d: any) => ({
    id: d.id,
    certif: d.certif,
    nom: `${d.stagiaires?.prenom ?? ""} ${d.stagiaires?.nom ?? ""}`.trim() || "(sans nom)",
  })).sort((a, b) => a.nom.localeCompare(b.nom));

  return NextResponse.json({ ok: true, dossiers });
}

export async function POST(req: NextRequest) {
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
  const demi = String(body?.demi_journee ?? "").trim();
  const heures = Number(body?.heures);

  if (!dossierId) return NextResponse.json({ ok: false, erreur: "Élève (dossier) requis." }, { status: 400 });
  if (demi !== "matin" && demi !== "apres_midi") return NextResponse.json({ ok: false, erreur: "Demi-journée : matin ou apres_midi." }, { status: 400 });
  if (!Number.isFinite(heures) || heures <= 0 || heures > 12) return NextResponse.json({ ok: false, erreur: "Heures invalides (0 < h ≤ 12)." }, { status: 400 });

  // Dossier valide et non annulé + sa formatrice référente (pour pré-renseigner la séance).
  const { data: d } = await supabaseAdmin
    .from("dossiers").select("id, statut, formatrice_id").eq("id", dossierId).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  if ((d as any).statut === "annule") return NextResponse.json({ ok: false, erreur: "Dossier annulé : walk-in impossible." }, { status: 409 });

  // Anti-antidate : la séance walk-in est forcément datée d'aujourd'hui (serveur, Europe/Paris).
  const date = parisToday();

  // Anti-doublon : pas deux séances sur le même créneau pour le même élève.
  const { data: existe } = await supabaseAdmin
    .from("planning").select("id")
    .eq("dossier_id", dossierId).eq("date_seance", date).eq("demi_journee", demi).maybeSingle();
  if (existe) return NextResponse.json({ ok: false, erreur: "Une séance existe déjà pour cet élève sur ce créneau aujourd'hui." }, { status: 409 });

  const { data: seance, error } = await supabaseAdmin
    .from("planning")
    .insert({
      dossier_id: dossierId,
      date_seance: date,
      demi_journee: demi,
      heures,
      hors_planning: true,
      formatrice_id: (d as any).formatrice_id ?? null,
    })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("dossier", dossierId, "seance_walk_in_creee",
    { date, demi_journee: demi, heures, planning_id: (seance as any).id }, u.email ?? null);

  return NextResponse.json({ ok: true, id: (seance as any).id, date });
}
