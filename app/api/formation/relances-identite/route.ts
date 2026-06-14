/**
 * MYSTORY — /api/formation/relances-identite  (rappel identité CPF à J+14 — orchestré par n8n)
 * GET  — liste les dossiers CPF dont l'identité n'est pas confirmée et dont le rappel est dû (contrôle).
 * POST — envoie le rappel par email au stagiaire (à confirmer son identité sur Mon Compte Formation),
 *        marque dossiers.cpf_identite_rappel_le et journalise. Idempotent (un rappel par dossier).
 * Éligibilité : dossier CPF, identité non confirmée, demande envoyée il y a ≥ 14 jours, pas déjà rappelé.
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

const DELAI_RAPPEL_JOURS = 14;

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function joursEntre(depuisISO: string, jusquISO: string): number {
  return Math.floor((new Date(jusquISO + "T00:00:00Z").getTime() - new Date(depuisISO + "T00:00:00Z").getTime()) / 86400000);
}
const estCpf = (d: any) => d.financement === "CPF" || d.origine_fonds === "CPF_CDC";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

async function dus() {
  const aujourdHui = aujourdHuiParisISO();
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, financement, origine_fonds, cpf_identite_demande_le, cpf_identite_ok, cpf_identite_rappel_le, stagiaires:stagiaire_id (civilite, nom, prenom, email)");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((d: any) => estCpf(d) && !d.cpf_identite_ok && d.cpf_identite_demande_le && !d.cpf_identite_rappel_le)
    .filter((d: any) => joursEntre(d.cpf_identite_demande_le, aujourdHui) >= DELAI_RAPPEL_JOURS)
    .filter((d: any) => d.stagiaires?.email)
    .map((d: any) => ({
      dossierId: d.id,
      civilite: d.stagiaires.civilite ?? "", prenom: d.stagiaires.prenom ?? "", nom: d.stagiaires.nom,
      email: d.stagiaires.email, demandeLe: d.cpf_identite_demande_le,
    }));
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

  const aujourdHui = aujourdHuiParisISO();
  const resultats: Array<{ email: string; envoye: boolean; erreur?: string }> = [];
  for (const c of liste) {
    const bonjour = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
    const corps = `
      <p>Bonjour ${bonjour},</p>
      <p>Pour finaliser votre dossier de formation financé par votre Compte Personnel de Formation (CPF),
      il vous reste à <strong>confirmer votre identité</strong> sur votre espace « Mon Compte Formation ».</p>
      <p>Sans cette confirmation, votre dossier ne peut pas se poursuivre. Merci de la réaliser dès que possible
      depuis le site officiel <strong>moncompteformation.gouv.fr</strong>.</p>
      <p>Une question ? Répondez simplement à cet email.</p>
      <p>L'équipe MYSTORY</p>`;
    const envoi = await envoyerEmail({
      a: c.email,
      objet: "Rappel : confirmez votre identité sur Mon Compte Formation",
      html: gabaritEmail("Confirmation d'identité CPF", corps),
      entite: "dossier", entiteId: c.dossierId, auteur: "rappel-identite-auto",
    });
    if (envoi.ok) {
      await supabaseAdmin.from("dossiers").update({ cpf_identite_rappel_le: aujourdHui }).eq("id", c.dossierId);
      await journal("dossier", c.dossierId, "cpf_identite_rappel_envoye", { email: c.email }, "rappel-identite-auto");
    }
    resultats.push({ email: c.email, envoye: envoi.ok, erreur: envoi.erreur });
  }
  return NextResponse.json({ ok: true, total: liste.length, envoyees: resultats.filter((r) => r.envoye).length, resultats });
}
