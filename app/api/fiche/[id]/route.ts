/**
 * MYSTORY — Fiche client 360° (lecture seule).
 * Agrège, autour d'un stagiaire : identité, dossiers de formation,
 * inscriptions d'examen (+ session + résultat) et remarques.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });

  const id = params.id;

  // 1) Identité du stagiaire (= le client)
  const { data: stagiaire, error: eS } = await supabaseAdmin
    .from("stagiaires")
    .select("id, civilite, nom, prenom, email, telephone, date_naissance, ville_naissance, adresse, cp, ville, agence")
    .eq("id", id)
    .maybeSingle();
  if (eS) return NextResponse.json({ ok: false, erreur: eS.message }, { status: 500 });
  if (!stagiaire) return NextResponse.json({ ok: false, erreur: "Client introuvable." }, { status: 404 });

  // 2) Dossiers de formation
  const { data: dossiers } = await supabaseAdmin
    .from("dossiers")
    .select(
      `id, certif, financement, montant, montant_encaisse, reste_a_charge_accepte, statut, statut_tunnel,
       niveau_initial, niveau_vise, niveau_atteint,
       heures_prevues, heures_realisees, date_debut, date_fin,
       service_fait_valide, numero_edof,
       participation_forfaitaire_reglee, participation_forfaitaire_exemptee, cpf_identite_ok,
       created_at`
    )
    .eq("stagiaire_id", id)
    .order("created_at", { ascending: false });
  const dossierIds = (dossiers ?? []).map((d: any) => d.id);

  // 3) Examens : ventes + session + résultat (requêtes séparées, robustes)
  const { data: ventes } = await supabaseAdmin
    .from("ventes_examen")
    .select("id, type_examen, sous_type, statut_paiement, montant, reste_a_payer, numero_attestation, date_inscription, session_id")
    .eq("candidat_id", id)
    .order("date_inscription", { ascending: false });
  const vIds = (ventes ?? []).map((v: any) => v.id);
  const sIds = [...new Set((ventes ?? []).map((v: any) => v.session_id).filter(Boolean))];

  const sessions = sIds.length
    ? (await supabaseAdmin.from("sessions_examen").select("id, date_examen, horaire, type").in("id", sIds as string[])).data ?? []
    : [];
  const resultats = vIds.length
    ? (await supabaseAdmin.from("resultats_examen").select("vente_id, statut, present, niveau_obtenu").in("vente_id", vIds as string[])).data ?? []
    : [];
  const sMap = new Map(sessions.map((s: any) => [s.id, s]));
  const rMap = new Map(resultats.map((r: any) => [r.vente_id, r]));
  const examens = (ventes ?? []).map((v: any) => ({
    ...v,
    session: v.session_id ? sMap.get(v.session_id) ?? null : null,
    resultat: rMap.get(v.id) ?? null,
  }));

  // 4) Remarques (rattachées aux dossiers du client)
  let remarques: any[] = [];
  if (dossierIds.length) {
    const { data: rem } = await supabaseAdmin
      .from("remarques")
      .select("id, texte, auteur, horodatage, dossier_id")
      .in("dossier_id", dossierIds)
      .order("horodatage", { ascending: false })
      .limit(30);
    remarques = rem ?? [];
  }

  // 5) Test initial / final (moteur d'évaluations, rattaché aux dossiers du client)
  let evaluations: any[] = [];
  if (dossierIds.length) {
    const { data: ev } = await supabaseAdmin
      .from("evaluations")
      .select("id, phase, dossier_id, statut, niveau_vise, ce_sur10, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, complete_le")
      .in("dossier_id", dossierIds)
      .order("complete_le", { ascending: false, nullsFirst: false });
    evaluations = ev ?? [];
  }

  // 6) Facturation : factures rattachées aux dossiers OU aux ventes d'examen du client
  let factures: any[] = [];
  if (dossierIds.length || vIds.length) {
    const cond: string[] = [];
    if (dossierIds.length) cond.push(`dossier_id.in.(${dossierIds.join(",")})`);
    if (vIds.length) cond.push(`vente_id.in.(${vIds.join(",")})`);
    const { data: fac } = await supabaseAdmin
      .from("factures")
      .select("numero, montant, statut, date_emission, type, designation")
      .or(cond.join(","))
      .order("date_emission", { ascending: false });
    factures = fac ?? [];
  }

  return NextResponse.json({ ok: true, stagiaire, dossiers: dossiers ?? [], examens, remarques, evaluations, factures });
}
