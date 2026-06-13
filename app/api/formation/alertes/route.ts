/**
 * MYSTORY — /api/formation/alertes
 * GET  → deux alertes :
 *   · participation : dossiers CPF avec participation forfaitaire (≈150€) non réglée et non exonérée ;
 *   · identite      : dossiers CPF dont la vérification d'identité CPF n'est pas confirmée
 *                     (statut : à envoyer / en attente / RAPPEL à J+14).
 * PATCH { dossierId, action } → participation_reglee | participation_exoneree | identite_envoyee | identite_ok.
 * Anti-antidate : « courriel envoyé » pose la date du jour (Europe/Paris). Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARTICIPATION_EUR = 150; // participation forfaitaire CPF 2026 (révisable)
const DELAI_RAPPEL_JOURS = 14;

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function joursEntre(depuisISO: string, jusquISO: string): number {
  const a = new Date(depuisISO + "T00:00:00Z").getTime();
  const b = new Date(jusquISO + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86400000);
}
const estCpf = (d: any) => d.financement === "CPF" || d.origine_fonds === "CPF_CDC";
const nomStagiaire = (d: any) => d.stagiaires ? `${d.stagiaires.prenom ?? ""} ${d.stagiaires.nom ?? ""}`.trim() : "—";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, financement, origine_fonds, date_validation_commande, participation_forfaitaire_reglee, participation_forfaitaire_exemptee, cpf_identite_demande_le, cpf_identite_ok, statut, stagiaires:stagiaire_id (nom, prenom, agence)");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const aujourdHui = aujourdHuiParisISO();
  const cpf = (data ?? []).filter(estCpf);

  const participation = cpf
    .filter((d: any) => !d.participation_forfaitaire_reglee && !d.participation_forfaitaire_exemptee)
    .map((d: any) => ({
      dossierId: d.id, stagiaire: nomStagiaire(d), agence: d.stagiaires?.agence ?? null,
      montant: PARTICIPATION_EUR, dateValidation: d.date_validation_commande,
    }));

  const identite = cpf
    .filter((d: any) => !d.cpf_identite_ok)
    .map((d: any) => {
      const envoyeLe = d.cpf_identite_demande_le as string | null;
      const jours = envoyeLe ? joursEntre(envoyeLe, aujourdHui) : null;
      const statut = !envoyeLe ? "a_envoyer" : (jours! >= DELAI_RAPPEL_JOURS ? "rappel" : "en_attente");
      return {
        dossierId: d.id, stagiaire: nomStagiaire(d), agence: d.stagiaires?.agence ?? null,
        envoyeLe, jours, statut,
      };
    });

  return NextResponse.json({
    ok: true,
    participation,
    identite,
    rappelsIdentite: identite.filter((i) => i.statut === "rappel").length,
    montantParticipation: PARTICIPATION_EUR,
    delaiRappelJours: DELAI_RAPPEL_JOURS,
  });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const auteur = u.email ?? null;

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const dossierId = String(b?.dossierId ?? "").trim();
  const action = String(b?.action ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  let patch: Record<string, unknown> | null = null;
  let evenement = "";
  let valeurs: Record<string, unknown> = {};

  if (action === "participation_reglee") {
    patch = { participation_forfaitaire_reglee: true };
    evenement = "participation_forfaitaire_reglee";
  } else if (action === "participation_exoneree") {
    const motif = String(b?.motif ?? "").trim() || null;
    patch = { participation_forfaitaire_exemptee: true, participation_forfaitaire_exemptee_motif: motif };
    evenement = "participation_forfaitaire_exoneree";
    valeurs = { motif };
  } else if (action === "identite_envoyee") {
    const leJour = aujourdHuiParisISO();
    patch = { cpf_identite_demande_le: leJour };
    evenement = "cpf_identite_courriel_envoye";
    valeurs = { envoye_le: leJour };
  } else if (action === "identite_ok") {
    patch = { cpf_identite_ok: true };
    evenement = "cpf_identite_confirmee";
  } else {
    return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("dossiers").update(patch).eq("id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("dossier", dossierId, evenement, valeurs, auteur);
  return NextResponse.json({ ok: true });
}
