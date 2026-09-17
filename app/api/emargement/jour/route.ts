/**
 * MYSTORY — GET /api/emargement/jour?date=YYYY-MM-DD&demi=matin|apres_midi
 * Liste les séances d'une demi-journée pour la tablette d'émargement, filtrées par CENTRE.
 * 17/09/2026 — la route renvoyait « lieu: "Gagny" » en dur. Depuis le 28/09, une
 * tablette posée à Rosny aurait listé les stagiaires des trois centres, et
 * affiché Gagny au-dessus.
 * Auth obligatoire (formatrice/équipe). Renvoie, par séance : stagiaire, statut d'émargement,
 * et le jeton (pour afficher le QR que le stagiaire scanne afin de signer sur son téléphone).
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

  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  const demi = (req.nextUrl.searchParams.get("demi") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, erreur: "Date invalide (YYYY-MM-DD)." }, { status: 400 });
  }

  let q = supabaseAdmin
    .from("planning")
    .select(`
      id, date_seance, demi_journee, heures, heures_realisees, emargement_token, hors_planning, centre,
      signature_stagiaire_url, signature_formatrice_url, emarge_le,
      dossier:dossiers!dossier_id ( id, certif, centre, stagiaire:stagiaires!stagiaire_id ( prenom, nom ) ),
      formatrice:formatrices!formatrice_id ( nom )
    `)
    .eq("date_seance", date);
  if (demi === "matin" || demi === "apres_midi") q = q.eq("demi_journee", demi);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });

  // Le centre demandé filtre la liste. Le repli sur le centre du dossier permet
  // aux séances créées avant le 17/09 — qui n'ont pas de centre — de rester
  // visibles plutôt que de disparaître de toutes les tablettes.
  const centre = (req.nextUrl.searchParams.get("centre") ?? "").trim().toUpperCase();
  const centreDe = (r: any) => r.centre ?? r.dossier?.centre ?? null;
  const brutes = (data ?? []).filter((r: any) => !centre || centreDe(r) === centre);

  const { data: refCentres } = await supabaseAdmin.from("centres").select("code, nom, adresse");
  const parCode = new Map((refCentres ?? []).map((c: any) => [String(c.code), c]));
  const lieuDuJour = parCode.get(centre) ?? parCode.get(String(centreDe(brutes[0] ?? {}) ?? "")) ?? null;

  const seances = brutes.map((r: any) => {
    const sig_s = !!r.signature_stagiaire_url;
    const sig_f = !!r.signature_formatrice_url;
    const statut = r.emarge_le ? "complet" : sig_s ? "attente_formatrice" : sig_f ? "attente_stagiaire" : "a_faire";
    return {
      id: r.id,
      dossier_id: r.dossier?.id ?? null,
      certif: r.dossier?.certif ?? null,
      stagiaire: r.dossier?.stagiaire ? `${r.dossier.stagiaire.prenom} ${r.dossier.stagiaire.nom}` : "—",
      formatrice: r.formatrice?.nom ?? null,
      demi_journee: r.demi_journee,
      centre: centreDe(r),
      heures: Number(r.heures),
      heures_realisees: r.heures_realisees != null ? Number(r.heures_realisees) : null,
      hors_planning: !!r.hors_planning,
      token: r.emargement_token,
      signe_stagiaire: sig_s,
      signe_formatrice: sig_f,
      emarge_le: r.emarge_le,
      statut,
    };
  });
  // Tri : demi-journée puis nom du stagiaire.
  seances.sort((a, b) => a.demi_journee.localeCompare(b.demi_journee) || a.stagiaire.localeCompare(b.stagiaire));

  return NextResponse.json({
    ok: true, date, demi: demi || null,
    centre: centre || (lieuDuJour ? String((lieuDuJour as any).code) : null),
    lieu: lieuDuJour ? String((lieuDuJour as any).nom) : null,
    adresse: lieuDuJour ? String((lieuDuJour as any).adresse ?? "") : null,
    seances,
  });
}
