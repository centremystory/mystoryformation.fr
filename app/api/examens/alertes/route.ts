/**
 * MYSTORY — GET /api/examens/alertes  (bandeau CRM + cron n8n quotidien)
 * Trois registres :
 *  · cci      : candidats à examen dans ≤ 5 jours OUVRÉS non inscrits CCI (TEF + civique)
 *  · acomptes : ventes en statut Acompte avec reste à payer — à solder avant l'examen
 *  · relances : résultats Échoué / Absent sans relance soldée + examens passés sans résultat saisi
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const dynamic = "force-dynamic";

/** Jours ouvrés (lun→ven) entre demain et la date cible incluse. Approximation sans fériés — alerte indicative. */
function joursOuvresAvant(dateISO: string, aujourdHuiISO: string): number {
  let n = 0;
  const d = new Date(aujourdHuiISO + "T12:00:00Z");
  const cible = new Date(dateISO + "T12:00:00Z");
  while (d < cible) {
    d.setUTCDate(d.getUTCDate() + 1);
    const j = d.getUTCDay();
    if (j >= 1 && j <= 5) n++;
  }
  return n;
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  const aujourdHui = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());

  // --- CCI : examens à venir, non plateforme, non inscrits, ventes actives
  const aVenir = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, type_examen, sous_type, inscrit_cci, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone, email), sessions_examen:session_id (date_examen, horaire, type)")
    .eq("inscrit_cci", false)
    .neq("type_examen", "Vente_plateforme")
    .not("statut_paiement", "in", "(\"Remboursé\",\"Annulé\")")
    .order("id").range(f, t));
  const cci = (aVenir ?? [])
    .filter((v: any) => v.sessions_examen?.date_examen >= aujourdHui)
    .map((v: any) => ({ ...v, jours_ouvres: joursOuvresAvant(v.sessions_examen.date_examen, aujourdHui) }))
    .filter((v: any) => v.jours_ouvres <= 5)
    .sort((a: any, b: any) => a.jours_ouvres - b.jours_ouvres);

  // --- Acomptes à solder
  const acomptes = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, montant, reste_a_payer, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone), sessions_examen:session_id (date_examen, horaire)")
    .eq("statut_paiement", "Acompte")
    .order("created_at").order("id").range(f, t));

  // --- Relances : Échoué / Absent + examens passés sans résultat
  const resultatsKo = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("resultats_examen")
    .select("vente_id, statut, ventes_examen:vente_id (numero_attestation, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone), sessions_examen:session_id (date_examen))")
    .in("statut", ["Échoué", "Absent"])
    .order("id").range(f, t));

  const passees = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone), sessions_examen:session_id (date_examen), resultats_examen (statut)")
    .neq("type_examen", "Vente_plateforme")
    .not("statut_paiement", "in", "(\"Remboursé\",\"Annulé\")")
    .order("id").range(f, t));
  const sansResultat = (passees ?? []).filter(
    (v: any) => v.sessions_examen?.date_examen && v.sessions_examen.date_examen < aujourdHui && !v.resultats_examen?.statut,
  );

  // --- Convocations manquantes : payés, examen à venir, convocation jamais envoyée
  const payesAvenir = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, statut_paiement, convocation_envoyee_le, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone, email), sessions_examen:session_id (date_examen, horaire)")
    .in("statut_paiement", ["Payé", "Inclus CPF"])
    .neq("type_examen", "Vente_plateforme")
    .is("convocation_envoyee_le", null)
    .order("id").range(f, t));
  const convocationsManquantes = (payesAvenir ?? [])
    .filter((v: any) => v.sessions_examen?.date_examen && v.sessions_examen.date_examen >= aujourdHui)
    .sort((a: any, b: any) => String(a.sessions_examen.date_examen).localeCompare(String(b.sessions_examen.date_examen)));

  // --- Complétude J-3 : examen dans ≤ 3 jours avec solde non réglé
  const bientot = await fetchAllRows<any>((f, t) => supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, reste_a_payer, statut_paiement, vendu_par, agence, stagiaires:candidat_id (nom, prenom, telephone), sessions_examen:session_id (date_examen, horaire)")
    .not("statut_paiement", "in", "(\"Remboursé\",\"Annulé\")")
    .gt("reste_a_payer", 0)
    .order("id").range(f, t));
  const joursCal = (dISO: string) => Math.floor((new Date(dISO + "T00:00:00Z").getTime() - new Date(aujourdHui + "T00:00:00Z").getTime()) / 86400000);
  const completudeJ3 = (bientot ?? [])
    .filter((v: any) => v.sessions_examen?.date_examen && joursCal(v.sessions_examen.date_examen) >= 0 && joursCal(v.sessions_examen.date_examen) <= 3)
    .sort((a: any, b: any) => String(a.sessions_examen.date_examen).localeCompare(String(b.sessions_examen.date_examen)));

  return NextResponse.json({
    ok: true,
    cci,
    acomptes: acomptes ?? [],
    convocations_manquantes: convocationsManquantes,
    completude_j3: completudeJ3,
    relances: {
      echoues_ou_absents: resultatsKo ?? [],
      sans_resultat_saisi: sansResultat,
    },
  });
}
