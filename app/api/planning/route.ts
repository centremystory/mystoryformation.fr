/**
 * MYSTORY — GET /api/planning
 * Liste les séances de formation (table planning) avec le contexte stagiaire/agence/formatrice,
 * pour le planning des élèves par site. Lecture seule. Auth obligatoire (équipe).
 * Le filtrage par agence et par période se fait côté page (jeu de données réduit).
 * Rappel : le lieu de formation des documents reste toujours Gagny — l'agence ici est
 * l'agence d'inscription du stagiaire, pour le suivi interne par site.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data, error } = await supabaseAdmin
    .from("planning")
    .select(`
      id, date_seance, demi_journee, heures, emarge_le,
      dossier:dossiers!dossier_id ( id, certif, statut, stagiaire:stagiaires!stagiaire_id ( prenom, nom, agence ) ),
      formatrice:formatrices!formatrice_id ( nom, prenom )
    `)
    .order("date_seance", { ascending: true })
    .order("demi_journee", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const seances = (data ?? []).map((r: any) => ({
    id: r.id,
    date_seance: r.date_seance,
    demi_journee: r.demi_journee,
    heures: Number(r.heures),
    emarge_le: r.emarge_le,
    dossier_id: r.dossier?.id ?? null,
    certif: r.dossier?.certif ?? null,
    statut_dossier: r.dossier?.statut ?? null,
    stagiaire: r.dossier?.stagiaire ? `${r.dossier.stagiaire.prenom ?? ""} ${r.dossier.stagiaire.nom ?? ""}`.trim() : "—",
    agence: r.dossier?.stagiaire?.agence ?? null,
    formatrice: r.formatrice ? `${r.formatrice.prenom ?? ""} ${r.formatrice.nom ?? ""}`.trim() : null,
  }));

  return NextResponse.json({ ok: true, lieu_formation: "Gagny", seances });
}
