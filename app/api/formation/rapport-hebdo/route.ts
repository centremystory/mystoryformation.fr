/**
 * MYSTORY — /api/formation/rapport-hebdo  (rapport hebdomadaire FORMATION — orchestré par n8n)
 * GET  — renvoie les chiffres de la semaine (contrôle, sans effet).
 * POST — calcule les chiffres des 7 derniers jours et les envoie par email à contact@mystoryformation.fr.
 * Protégé par requireUser (session équipe / Direction, ou Bearer JWT n8n sans rôle).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEST = "contact@mystoryformation.fr";
const estCpf = (d: any) => d.financement === "CPF" || d.origine_fonds === "CPF_CDC";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

async function calcul() {
  const maintenant = new Date();
  const ilYa7jISO = new Date(maintenant.getTime() - 7 * 86400000).toISOString();
  const ilYa7jDate = ilYa7jISO.slice(0, 10);
  const aujourdHuiDate = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(maintenant);

  // Séances émargées (présentes) cette semaine + heures réalisées
  const { data: seances } = await supabaseAdmin
    .from("planning").select("heures, heures_realisees, absence, emarge_le").gte("emarge_le", ilYa7jISO);
  const sEmargees = (seances ?? []).filter((s: any) => !s.absence);
  const nbSeances = sEmargees.length;
  const heures = sEmargees.reduce((t: number, s: any) => t + Number(s.heures_realisees ?? s.heures ?? 0), 0);

  // Dossiers clôturés (date_fin dans les 7 derniers jours)
  const { data: clotures } = await supabaseAdmin
    .from("dossiers").select("id, date_fin").gte("date_fin", ilYa7jDate).lte("date_fin", aujourdHuiDate);
  const nbClotures = (clotures ?? []).length;

  // Satisfaction des séances notées cette semaine
  const { data: notes } = await supabaseAdmin
    .from("satisfaction_seance").select("note, horodatage").gte("horodatage", ilYa7jISO);
  const lesNotes = (notes ?? []).map((n: any) => Number(n.note)).filter((n: number) => n > 0);
  const moyenne = lesNotes.length ? Math.round((lesNotes.reduce((a, b) => a + b, 0) / lesNotes.length) * 100) / 100 : null;

  // Alertes en cours (dossiers CPF)
  const { data: dossiers } = await supabaseAdmin
    .from("dossiers").select("financement, origine_fonds, cpf_identite_ok, participation_forfaitaire_reglee, participation_forfaitaire_exemptee");
  const cpf = (dossiers ?? []).filter(estCpf);
  const participationDue = cpf.filter((d: any) => !d.participation_forfaitaire_reglee && !d.participation_forfaitaire_exemptee).length;
  const identiteDue = cpf.filter((d: any) => !d.cpf_identite_ok).length;

  return {
    periode: `${ilYa7jDate} → ${aujourdHuiDate}`,
    nbSeances, heures: Math.round(heures * 100) / 100, nbClotures,
    satisfactionMoyenne: moyenne, notes: lesNotes.length,
    participationDue, identiteDue,
  };
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  try { return NextResponse.json({ ok: true, rapport: await calcul() }); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let r;
  try { r = await calcul(); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }

  const ligne = (label: string, val: string | number) =>
    `<tr><td style="padding:6px 10px;color:#555;">${label}</td><td style="padding:6px 10px;font-weight:600;text-align:right;">${val}</td></tr>`;
  const corps = `
    <p>Bonjour,</p>
    <p>Voici le rapport hebdomadaire <strong>Formation</strong> (${r.periode}) :</p>
    <table style="border-collapse:collapse;width:100%;max-width:480px;">
      ${ligne("Séances réalisées (émargées)", r.nbSeances)}
      ${ligne("Heures de formation réalisées", r.heures + " h")}
      ${ligne("Dossiers clôturés", r.nbClotures)}
      ${ligne("Satisfaction moyenne (séances notées)", r.satisfactionMoyenne != null ? `${r.satisfactionMoyenne}/5 (${r.notes})` : "—")}
      ${ligne("Participations 150 € à régler", r.participationDue)}
      ${ligne("Identités CPF à confirmer", r.identiteDue)}
    </table>
    <p style="color:#888;font-size:13px;margin-top:16px;">Rapport automatique — CRM MYSTORY.</p>`;
  const envoi = await envoyerEmail({
    a: DEST,
    objet: `MYSTORY — Rapport hebdo Formation (${r.periode})`,
    html: gabaritEmail("Rapport hebdomadaire — Formation", corps),
    entite: "rapport", auteur: "rapport-hebdo-formation",
  });
  return NextResponse.json({ ok: envoi.ok, erreur: envoi.erreur, rapport: r });
}
