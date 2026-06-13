/**
 * MYSTORY — /api/satisfaction  (satisfaction à chaud PAR COURS, saisie équipe)
 * GET   ?agence= &dossier=  → séances évaluables (émargées + présentes) + synthèse (moyenne, nb).
 * POST  { seanceId, note(1..5), commentaire? }  → enregistre / met à jour la note de la séance.
 * Une note par séance (upsert). Pas de suppression. Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const agence = req.nextUrl.searchParams.get("agence");
  const dossier = req.nextUrl.searchParams.get("dossier");
  let q = supabaseAdmin
    .from("v_satisfaction_seances")
    .select("*")
    .order("date_seance", { ascending: false })
    .order("demi_journee", { ascending: true })
    .limit(300);
  if (agence) q = q.eq("agence", agence);
  if (dossier) q = q.eq("dossier_id", dossier);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];
  const notes = rows.filter((r) => r.note != null).map((r) => Number(r.note));
  const resume = {
    total: rows.length,
    notees: notes.length,
    moyenne: notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 100) / 100 : null,
  };
  const agences = Array.from(new Set(rows.map((r) => r.agence).filter(Boolean))).sort();
  return NextResponse.json({ ok: true, seances: rows, resume, agences });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const seanceId = String(b?.seanceId ?? "").trim();
  const note = Number(b?.note);
  const commentaire = String(b?.commentaire ?? "").trim() || null;
  if (!seanceId) return NextResponse.json({ ok: false, erreur: "Séance requise." }, { status: 400 });
  if (!Number.isInteger(note) || note < 1 || note > 5) return NextResponse.json({ ok: false, erreur: "Note attendue entre 1 et 5." }, { status: 400 });

  // dossier_id fiable depuis la séance (on ne fait pas confiance au body).
  const { data: seance, error: eSeance } = await supabaseAdmin
    .from("planning").select("dossier_id, emarge_le, absence").eq("id", seanceId).single();
  if (eSeance || !seance) return NextResponse.json({ ok: false, erreur: "Séance introuvable." }, { status: 404 });
  if (!(seance as any).emarge_le || (seance as any).absence) {
    return NextResponse.json({ ok: false, erreur: "Séance non évaluable (non émargée ou absence)." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("satisfaction_seance").upsert(
    { seance_id: seanceId, dossier_id: (seance as any).dossier_id, note, commentaire, auteur: u.email ?? null, maj_le: new Date().toISOString() },
    { onConflict: "seance_id" },
  );
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("satisfaction_seance", seanceId, "satisfaction_saisie", { note }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
