/**
 * MYSTORY — /api/formation/relances-sans-venue  (relance « stagiaire sans venue » — orchestré par n8n)
 * Entrée/sortie libres : un stagiaire dont la formation est en cours mais qui n'a pas émargé
 * depuis un certain temps reçoit un message d'encouragement à revenir.
 * GET  — liste les dossiers éligibles (contrôle).
 * POST — envoie la relance, marque dossiers.relance_sans_venue_le (cooldown) et journalise.
 * Éligibilité : formation démarrée, service fait non validé, des séances restent à émarger,
 *   aucune venue (émargement) depuis ≥ SEUIL jours, pas relancé depuis < COOLDOWN jours.
 * Protégé par requireUser (session équipe / Direction, ou Bearer JWT n8n sans rôle).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SEUIL_JOURS = 10;     // pas de venue depuis 10 jours
const COOLDOWN_JOURS = 14;  // au plus une relance toutes les 2 semaines

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function joursEntre(depuisISO: string, jusquISO: string): number {
  return Math.floor((new Date(jusquISO + "T00:00:00Z").getTime() - new Date(depuisISO + "T00:00:00Z").getTime()) / 86400000);
}

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

async function dus() {
  const today = aujourdHuiParisISO();
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, statut, date_debut, service_fait_valide, relance_sans_venue_le, stagiaires:stagiaire_id (civilite, nom, prenom, email), planning (date_seance, emarge_le, absence)");
  if (error) throw new Error(error.message);

  const eligibles: Array<{ dossierId: string; civilite: string; prenom: string; nom: string; email: string; dernier: string | null }> = [];

  for (const d of (data ?? []) as any[]) {
    if (d.service_fait_valide) continue;                 // formation validée → terminée
    if (d.statut === "annule") continue;
    const email = d.stagiaires?.email; if (!email) continue;
    const seances = (d.planning ?? []) as any[];
    if (seances.length === 0) continue;                  // pas de planning
    if (d.date_debut && today < d.date_debut) continue;  // pas encore commencée

    const restantes = seances.filter((s) => !s.emarge_le && !s.absence);
    if (restantes.length === 0) continue;                // plus rien à venir

    const emargees = seances.filter((s) => s.emarge_le).map((s) => String(s.emarge_le).slice(0, 10)).sort();
    const dernier = emargees.length ? emargees[emargees.length - 1] : null;

    let dejaLong = false;
    if (dernier) {
      dejaLong = joursEntre(dernier, today) >= SEUIL_JOURS;
    } else {
      // jamais venu : une séance déjà passée depuis ≥ SEUIL jours
      const passees = seances.map((s) => s.date_seance).filter((dt: string) => dt <= today).sort();
      if (passees.length) dejaLong = joursEntre(passees[0], today) >= SEUIL_JOURS;
    }
    if (!dejaLong) continue;

    if (d.relance_sans_venue_le && joursEntre(d.relance_sans_venue_le, today) < COOLDOWN_JOURS) continue;

    eligibles.push({
      dossierId: d.id, civilite: d.stagiaires.civilite ?? "", prenom: d.stagiaires.prenom ?? "",
      nom: d.stagiaires.nom, email, dernier,
    });
  }
  return eligibles;
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  try { return NextResponse.json({ ok: true, dus: await dus() }); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let liste;
  try { liste = await dus(); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }

  const today = aujourdHuiParisISO();
  const resultats: Array<{ email: string; envoye: boolean; erreur?: string }> = [];
  for (const c of liste) {
    const bonjour = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
    const corps = `
      <p>Bonjour ${bonjour},</p>
      <p>Nous avons remarqué que vous n'êtes pas venu(e) à votre formation depuis quelques jours.
      Pour avancer sereinement vers votre certification, l'idéal est de garder un rythme régulier 🙂</p>
      <p><strong>Quand venir ?</strong> L'accès est libre, aux horaires du centre :<br>
      Matin : 9h30–12h30 · Après-midi : 14h–17h.</p>
      <p><strong>Où ?</strong> MYSTORY — 3 bis avenue de Gagny, 93220 Gagny.</p>
      <p>Un empêchement, une difficulté ? Répondez à cet email ou appelez-nous au 06 81 43 16 54, on s'organise ensemble.</p>
      <p>À très vite,<br>L'équipe MYSTORY</p>`;
    const envoi = await envoyerEmail({
      a: c.email,
      objet: "On vous attend à votre formation MYSTORY 🙂",
      html: gabaritEmail("Reprenons votre formation", corps),
      entite: "dossier", entiteId: c.dossierId, auteur: "relance-sans-venue-auto",
    });
    if (envoi.ok) {
      await supabaseAdmin.from("dossiers").update({ relance_sans_venue_le: today }).eq("id", c.dossierId);
      await journal("dossier", c.dossierId, "relance_sans_venue_envoyee", { email: c.email, derniere_venue: c.dernier }, "relance-sans-venue-auto");
    }
    resultats.push({ email: c.email, envoye: envoi.ok, erreur: envoi.erreur });
  }
  return NextResponse.json({ ok: true, total: liste.length, envoyees: resultats.filter((r) => r.envoye).length, resultats });
}
