/**
 * MYSTORY — Satisfaction à CHAUD du cours, réponse du STAGIAIRE (public, par jeton de séance).
 *  GET  ?token=  → contexte de la séance (prénom, date, demi-journée, déjà répondu ?).
 *  POST { token, note(1..5), commentaire? } → enregistre la réponse dans satisfaction_seance.
 * Le jeton = planning.emargement_token (capability non devinable, déjà utilisé pour la signature).
 * Verrou : la séance doit être émargée (le stagiaire était présent). Une réponse par séance.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMI: Record<string, string> = { matin: "ce matin", apres_midi: "cet après-midi" };

async function seanceParToken(token: string) {
  const { data } = await supabaseAdmin
    .from("planning")
    .select("id, dossier_id, date_seance, demi_journee, emarge_le, absence, dossier:dossiers!dossier_id ( certif, stagiaire:stagiaires!stagiaire_id ( prenom ) )")
    .eq("emargement_token", token)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function GET(req: NextRequest) {
  const token = String(req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  const s = await seanceParToken(token);
  if (!s) return NextResponse.json({ ok: false, erreur: "Cours introuvable." }, { status: 404 });
  if (!s.emarge_le || s.absence) return NextResponse.json({ ok: false, erreur: "Ce cours n'est pas encore validé." }, { status: 400 });

  const { data: deja } = await supabaseAdmin
    .from("satisfaction_seance").select("note").eq("seance_id", s.id).maybeSingle();

  return NextResponse.json({
    ok: true,
    prenom: s.dossier?.stagiaire?.prenom ?? null,
    quand: DEMI[s.demi_journee] ?? "aujourd'hui",
    date: s.date_seance,
    dejaRepondu: !!deja,
  });
}

export async function POST(req: NextRequest) {
  if (await limiteDepassee(`satisfcours:${ipDe(req)}`, 20, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives, réessayez plus tard." }, { status: 429 });
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const token = String(b?.token ?? "").trim();
  const note = Number(b?.note);
  const commentaire = String(b?.commentaire ?? "").trim().slice(0, 1000) || null;
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  if (!Number.isInteger(note) || note < 1 || note > 5) return NextResponse.json({ ok: false, erreur: "Note attendue entre 1 et 5." }, { status: 400 });

  const s = await seanceParToken(token);
  if (!s) return NextResponse.json({ ok: false, erreur: "Cours introuvable." }, { status: 404 });
  if (!s.emarge_le || s.absence) return NextResponse.json({ ok: false, erreur: "Ce cours n'est pas encore validé." }, { status: 400 });

  const { error } = await supabaseAdmin.from("satisfaction_seance").upsert(
    { seance_id: s.id, dossier_id: s.dossier_id, note, commentaire, auteur: "stagiaire", maj_le: new Date().toISOString() },
    { onConflict: "seance_id" },
  );
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
