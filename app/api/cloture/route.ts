/**
 * MYSTORY — /api/cloture  (clôture pédagogique de formation — items 1+3+10)
 * GET  ?dossierId  → aperçu : heures prévues vs réalisées (depuis l'émargement),
 *                    date de fin réelle (dernière séance émargée), niveau visé vs atteint.
 * POST { dossierId, niveauAtteint?, ecartConfirme? } → fige date_fin, heures_realisees,
 *        niveau_atteint sur le dossier (+ journal). Distinct du « service fait validé EDOF ».
 *
 * Règles : heures réalisées = séances ÉMARGÉES présentes (absences exclues) ;
 * date_fin = dernière séance émargée ; anti-antidate (pas de séance future, pas de clôture
 * sans émargement) ; écart prévu/réalisé → confirmation obligatoire (ecart_heures_confirme) ;
 * niveau atteint prérempli depuis le dossier (posé par l'évaluation finale) sinon saisi.
 * Restriction : Pédagogie / Formatrice / Direction (action evaluation_finale).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIVEAUX = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

type Calc = { heuresRealisees: number; dateFinReelle: string | null; nbSeancesEmargees: number; nbAbsences: number };

/** Calcule les heures réalisées et la date de fin réelle à partir des séances ÉMARGÉES présentes. */
async function calculer(dossierId: string): Promise<Calc> {
  const { data: seances } = await supabaseAdmin
    .from("planning")
    .select("date_seance, heures, heures_realisees, emarge_le, absence")
    .eq("dossier_id", dossierId);
  let heures = 0, nbEm = 0, nbAbs = 0;
  let derniere: string | null = null;
  for (const s of (seances ?? []) as any[]) {
    if (s.absence === true) { nbAbs++; continue; }
    if (!s.emarge_le) continue; // séance non émargée → ignorée (anti-émargement fictif)
    nbEm++;
    const h = Number(s.heures_realisees ?? s.heures ?? 0);
    if (Number.isFinite(h)) heures += h;
    const d = s.date_seance as string | null;
    if (d && (!derniere || d > derniere)) derniere = d;
  }
  return { heuresRealisees: heures, dateFinReelle: derniere, nbSeancesEmargees: nbEm, nbAbsences: nbAbs };
}

async function chargerDossier(dossierId: string) {
  const { data } = await supabaseAdmin
    .from("dossiers")
    .select("id, statut, certif, heures_prevues, heures_realisees, niveau_vise, niveau_atteint, date_fin, ecart_heures_confirme")
    .eq("id", dossierId)
    .maybeSingle();
  return data as any;
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const dossierId = (req.nextUrl.searchParams.get("dossierId") ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  const d = await chargerDossier(dossierId);
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  const calc = await calculer(dossierId);
  const ecart = d.heures_prevues != null && calc.heuresRealisees !== Number(d.heures_prevues);

  return NextResponse.json({
    ok: true,
    apercu: {
      certif: d.certif,
      statut: d.statut,
      heuresPrevues: d.heures_prevues,
      heuresRealisees: calc.heuresRealisees,
      ecart,
      dateFinReelle: calc.dateFinReelle,
      dateFinActuelle: d.date_fin,
      nbSeancesEmargees: calc.nbSeancesEmargees,
      nbAbsences: calc.nbAbsences,
      niveauVise: d.niveau_vise,
      niveauAtteint: d.niveau_atteint, // prérempli (évaluation finale) ou null → saisie
      doitSaisirNiveau: !d.niveau_atteint,
      niveaux: NIVEAUX,
    },
  });
}

export async function POST(req: NextRequest) {
  let u: SessionUser;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (u.role && !peut(u.role, "evaluation_finale")) {
    return NextResponse.json({ ok: false, erreur: "Clôture réservée à la Pédagogie, aux Formatrices et à la Direction." }, { status: 403 });
  }

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const dossierId = String(b?.dossierId ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  const d = await chargerDossier(dossierId);
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const calc = await calculer(dossierId);
  if (calc.nbSeancesEmargees === 0 || !calc.dateFinReelle) {
    return NextResponse.json({ ok: false, erreur: "Aucune séance émargée : impossible de clôturer (pas d'émargement fictif, pas d'antidate)." }, { status: 409 });
  }
  if (calc.dateFinReelle > aujourdHuiParisISO()) {
    return NextResponse.json({ ok: false, erreur: "La dernière séance émargée est dans le futur : incohérent." }, { status: 409 });
  }

  // Niveau atteint : prérempli depuis le dossier (posé par l'évaluation finale) sinon saisi.
  let niveauAtteint = (d.niveau_atteint as string | null) || null;
  const saisi = String(b?.niveauAtteint ?? "").trim();
  if (!niveauAtteint) {
    if (!NIVEAUX.includes(saisi)) {
      return NextResponse.json({ ok: false, erreur: "Niveau atteint à renseigner (A0 → C2) : l'évaluation finale ne l'a pas encore fixé." }, { status: 409 });
    }
    niveauAtteint = saisi;
  } else if (saisi && NIVEAUX.includes(saisi)) {
    niveauAtteint = saisi; // correction explicite autorisée
  }

  // Écart prévu / réalisé → confirmation obligatoire.
  const ecart = d.heures_prevues != null && calc.heuresRealisees !== Number(d.heures_prevues);
  if (ecart && b?.ecartConfirme !== true) {
    return NextResponse.json(
      { ok: false, status: "ecart_a_confirmer", erreur: `Écart d'heures : prévues ${d.heures_prevues} h ≠ réalisées ${calc.heuresRealisees} h. Confirmation requise.`, heuresPrevues: d.heures_prevues, heuresRealisees: calc.heuresRealisees },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {
    heures_realisees: calc.heuresRealisees,
    date_fin: calc.dateFinReelle,
    niveau_atteint: niveauAtteint,
  };
  if (ecart) patch.ecart_heures_confirme = true;

  const { error } = await supabaseAdmin.from("dossiers").update(patch).eq("id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("dossier", dossierId, "cloture_formation", {
    date_fin: calc.dateFinReelle,
    heures_prevues: d.heures_prevues,
    heures_realisees: calc.heuresRealisees,
    ecart,
    niveau_vise: d.niveau_vise,
    niveau_atteint: niveauAtteint,
    seances_emargees: calc.nbSeancesEmargees,
    absences: calc.nbAbsences,
  }, u.email ?? null);

  return NextResponse.json({ ok: true, dateFinReelle: calc.dateFinReelle, heuresRealisees: calc.heuresRealisees, niveauAtteint, ecart });
}
