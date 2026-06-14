/**
 * MYSTORY — /api/dossiers/relances-satisfaction  (satisfaction à froid, J+3 mois — orchestré par n8n)
 * GET  — liste les dossiers terminés il y a 3 à 6 mois SANS réponse froide (contrôle, sans effet).
 * POST — envoie l'invitation « à froid » par email au stagiaire (lien personnel), marque l'envoi
 *        (dossiers.satisfaction_froid_envoyee_le) et journalise. Idempotent : un dossier déjà
 *        répondu OU déjà invité n'est pas (re)contacté.
 * Protégé par requireUser : session équipe / Direction, ou Bearer JWT n8n (sans rôle = passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

function fenetre() {
  const aujourdHui = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ilYa3Mois = new Date(aujourdHui); ilYa3Mois.setMonth(ilYa3Mois.getMonth() - 3);
  const ilYa6Mois = new Date(aujourdHui); ilYa6Mois.setMonth(ilYa6Mois.getMonth() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { de: iso(ilYa6Mois), a: iso(ilYa3Mois), aujourdHui: iso(aujourdHui) };
}

async function candidats(req: NextRequest, seulementNonInvites: boolean) {
  const { de, a } = fenetre();
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, token, date_fin, certif, satisfaction_froid_envoyee_le, stagiaires ( civilite, prenom, nom, email )")
    .gte("date_fin", de).lte("date_fin", a);
  if (error) throw new Error(error.message);
  const { data: repondus } = await supabaseAdmin.from("satisfactions").select("dossier_id").eq("type", "froid");
  const dejaRepondu = new Set((repondus ?? []).map((r: any) => r.dossier_id));
  const origine = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return (data ?? [])
    .filter((d: any) => !dejaRepondu.has(d.id) && d.stagiaires?.email)
    .filter((d: any) => !seulementNonInvites || !d.satisfaction_froid_envoyee_le)
    .map((d: any) => ({
      dossierId: d.id, certif: d.certif, dateFin: d.date_fin,
      civilite: d.stagiaires.civilite ?? "", prenom: d.stagiaires.prenom ?? "", nom: d.stagiaires.nom,
      email: d.stagiaires.email, dejaInvite: !!d.satisfaction_froid_envoyee_le,
      lien: `${origine}/satisfaction?token=${d.token}&type=froid`,
    }));
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  try {
    return NextResponse.json({ ok: true, relances: await candidats(req, false) });
  } catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let aEnvoyer;
  try { aEnvoyer = await candidats(req, true); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }

  const { aujourdHui } = fenetre();
  const resultats: Array<{ email: string; envoye: boolean; erreur?: string }> = [];
  for (const c of aEnvoyer) {
    const bonjour = [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
    const corps = `
      <p>Bonjour ${bonjour},</p>
      <p>Vous avez suivi une formation chez MYSTORY il y a environ trois mois. Afin d'améliorer nos formations,
      nous aimerions recueillir votre avis « à froid » — cela ne prend que deux minutes.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${c.lien}" style="background:#2F72DE;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Donner mon avis</a>
      </p>
      <p>Merci de votre confiance.<br>L'équipe MYSTORY</p>`;
    const envoi = await envoyerEmail({
      a: c.email,
      objet: "Votre avis, 3 mois après votre formation chez MYSTORY",
      html: gabaritEmail("Questionnaire de satisfaction à froid", corps),
      entite: "dossier", entiteId: c.dossierId, auteur: "satisfaction-froid-auto",
    });
    if (envoi.ok) {
      await supabaseAdmin.from("dossiers").update({ satisfaction_froid_envoyee_le: aujourdHui }).eq("id", c.dossierId);
      await journal("dossier", c.dossierId, "satisfaction_froid_envoyee", { email: c.email }, "satisfaction-froid-auto");
    }
    resultats.push({ email: c.email, envoye: envoi.ok, erreur: envoi.erreur });
  }
  return NextResponse.json({ ok: true, total: aEnvoyer.length, envoyees: resultats.filter((r) => r.envoye).length, resultats });
}
