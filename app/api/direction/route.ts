/**
 * MYSTORY — Cockpit Direction (agrégats auto, lecture seule).
 *  GET ?debut=YYYY-MM-DD&fin=YYYY-MM-DD&agence=Gagny|Sarcelles|Rosny
 *  Trois blocs, calculés à partir de ce qui est DÉJÀ dans la base (aucune saisie) :
 *   - activite     : inscriptions, dossiers clôturés, heures dispensées (réelles), élèves en formation
 *   - acquisition  : nouveaux prospects, inscriptions, ventes examen, taux indicatif
 *   - finances     : facturé / encaissé / à encaisser (formation) + CA examens / reste à encaisser
 *  Réservé Direction/Manager (le filet équipe « staff » passe pendant la transition).
 *  Toutes les définitions sont explicitées côté page (pas d'interprétation cachée).
 */
import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiParisISO } from "@/lib/dates";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUTS_ANNULATION = new Set(["annulee", "annulée", "annulé", "annule", "avoir"]);

function jour(s: string | null | undefined): string {
  return (s ?? "").slice(0, 10);
}
function dansPeriode(dateStr: string | null | undefined, debut: string, fin: string): boolean {
  const d = jour(dateStr);
  return !!d && d >= debut && d <= fin;
}
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["direction", "manager"]);
    const url = new URL(req.url);
    const today = aujourdhuiParisISO();
    const debutMois = today.slice(0, 8) + "01";
    const debut = jour(url.searchParams.get("debut")) || debutMois;
    const fin = jour(url.searchParams.get("fin")) || today;
    const agence = url.searchParams.get("agence") || "";
    const okAgence = (a: string | null | undefined) => !agence || (a ?? "") === agence;

    const [dossiersRes, planningRes, facturesRes, ventesRes, prospectsRes] = await Promise.all([
      supabaseAdmin
        .from("dossiers")
        .select("id, statut, date_fin, created_at, heures_prevues, stagiaire:stagiaires!stagiaire_id ( agence )"),
      supabaseAdmin
        .from("planning")
        .select("heures, heures_realisees, emarge_le, date_seance, dossier:dossiers!dossier_id ( statut, date_fin, stagiaire:stagiaires!stagiaire_id ( agence ) )"),
      supabaseAdmin
        .from("factures")
        .select("montant, statut, date_emission, date_paiement, dossier_id, vente_id"),
      supabaseAdmin
        .from("ventes_examen")
        .select("id, montant, reste_a_payer, type_examen, date_inscription, agence, statut_paiement"),
      supabaseAdmin
        .from("messages_prospects")
        .select("cree_le"),
    ]);

    // ---- ACTIVITÉ ----
    const dossiers = (dossiersRes.data ?? []) as any[];
    const dossiersAg = dossiers.filter((d) => okAgence(d.stagiaire?.agence));
    const inscriptions = dossiersAg.filter((d) => dansPeriode(d.created_at, debut, fin)).length;
    const clotures = dossiersAg.filter((d) => d.date_fin && dansPeriode(d.date_fin, debut, fin)).length;
    const elevesEnFormation = dossiersAg.filter((d) => d.statut === "incomplet" && !d.date_fin).length;

    // Heures réellement dispensées sur la période (séances émargées) — durée réelle (B1).
    const planning = (planningRes.data ?? []) as any[];
    let heuresDispensees = 0;
    for (const s of planning) {
      const ag = s.dossier?.stagiaire?.agence;
      if (!okAgence(ag)) continue;
      if (s.emarge_le && dansPeriode(s.date_seance, debut, fin)) {
        heuresDispensees += num(s.heures_realisees ?? s.heures);
      }
    }

    // ---- ACQUISITION ----
    const prospects = ((prospectsRes.data ?? []) as any[]).filter((p) => dansPeriode(p.cree_le, debut, fin)).length;
    const ventes = (ventesRes.data ?? []) as any[];
    const ventesPeriode = ventes.filter((v) => okAgence(v.agence) && dansPeriode(v.date_inscription, debut, fin));
    const nbVentesExamen = ventesPeriode.length;
    // Taux indicatif : inscriptions formation rapportées aux prospects entrants sur la même période.
    // (les prospects n'ont pas d'agence -> ce ratio est global, fourni à titre indicatif)
    const tauxConversion = prospects > 0 ? Math.round((inscriptions / prospects) * 100) : null;

    // ---- FINANCES (formation) ----
    const factures = (facturesRes.data ?? []) as any[];
    const agenceParDossier = new Map<string, string | null>();
    for (const d of dossiers) agenceParDossier.set(d.id, d.stagiaire?.agence ?? null);
    const agenceParVente = new Map<string, string | null>();
    for (const v of ventes) agenceParVente.set(v.id, v.agence ?? null);
    const factureAgence = (f: any) =>
      (f.dossier_id ? agenceParDossier.get(f.dossier_id) ?? null : null) ??
      (f.vente_id ? agenceParVente.get(f.vente_id) ?? null : null) ??
      null;
    const facturesAg = factures.filter((f) => okAgence(factureAgence(f)) && !STATUTS_ANNULATION.has((f.statut ?? "").toLowerCase()));
    const facture = facturesAg
      .filter((f) => dansPeriode(f.date_emission, debut, fin))
      .reduce((s, f) => s + num(f.montant), 0);
    const encaisse = facturesAg
      .filter((f) => f.date_paiement && dansPeriode(f.date_paiement, debut, fin))
      .reduce((s, f) => s + num(f.montant), 0);
    // À encaisser = encours total (toutes périodes) des factures émises non réglées.
    const aEncaisser = facturesAg
      .filter((f) => !f.date_paiement)
      .reduce((s, f) => s + num(f.montant), 0);

    // ---- FINANCES (examens) ----
    const caExamens = ventesPeriode.reduce((s, v) => s + num(v.montant), 0);
    const resteExamens = ventes
      .filter((v) => okAgence(v.agence))
      .reduce((s, v) => s + num(v.reste_a_payer), 0);
    const parTypeExamen: Record<string, number> = {};
    for (const v of ventesPeriode) {
      const t = v.type_examen || "Autre";
      parTypeExamen[t] = (parTypeExamen[t] || 0) + num(v.montant);
    }

    return NextResponse.json({
      ok: true,
      periode: { debut, fin, agence: agence || null },
      activite: { inscriptions, clotures, heuresDispensees: Math.round(heuresDispensees * 10) / 10, elevesEnFormation },
      acquisition: { prospects, inscriptions, ventesExamen: nbVentesExamen, tauxConversion },
      finances: {
        facture: Math.round(facture * 100) / 100,
        encaisse: Math.round(encaisse * 100) / 100,
        aEncaisser: Math.round(aEncaisser * 100) / 100,
        caExamens: Math.round(caExamens * 100) / 100,
        resteExamens: Math.round(resteExamens * 100) / 100,
        parTypeExamen,
      },
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction." }, { status: 403 });
    return NextResponse.json({ ok: false, erreur: "Erreur serveur." }, { status: 500 });
  }
}
