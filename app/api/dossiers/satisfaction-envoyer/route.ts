/**
 * MYSTORY — POST /api/dossiers/satisfaction-envoyer
 * Envoie au stagiaire, par e-mail, le lien personnel de son questionnaire de satisfaction.
 *  Body : { dossierId, type: "chaud" | "froid" }
 * Le lien est une capability par jeton (dossiers.token) ; la réponse reste verrouillée
 * côté serveur (immuable, anti-antidate) par POST /api/satisfaction. Idempotence douce :
 * on journalise chaque envoi, et pour le froid on marque dossiers.satisfaction_froid_envoyee_le.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://mystory-automatisation.vercel.app";

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const b = await req.json().catch(() => ({}));
  const dossierId = String(b?.dossierId ?? "").trim();
  const type = b?.type === "froid" ? "froid" : "chaud";
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });
  if (!EMAIL_ACTIF) return NextResponse.json({ ok: false, erreur: "L'envoi d'e-mail n'est pas configuré." }, { status: 503 });

  const { data: d } = await supabaseAdmin
    .from("dossiers")
    .select("id, token, stagiaires ( civilite, prenom, nom, email )")
    .eq("id", dossierId).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const st: any = (d as any).stagiaires;
  const email = st?.email as string | undefined;
  if (!email) return NextResponse.json({ ok: false, erreur: "Le stagiaire n'a pas d'adresse e-mail enregistrée." }, { status: 409 });

  const prenom = st?.prenom ?? "";
  const lien = `${APP_URL}/satisfaction?token=${(d as any).token}&type=${type}`;
  const titre = type === "chaud" ? "Votre avis sur la formation" : "Votre retour, 3 mois après la formation";
  const intro = type === "chaud"
    ? "Votre formation chez MYSTORY touche à sa fin. Votre avis nous aide à progresser et fait partie de notre démarche qualité."
    : "Cela fait quelques mois que votre formation chez MYSTORY est terminée. Nous aimerions savoir où vous en êtes.";

  const corps = `
    <p>Bonjour ${prenom},</p>
    <p>${intro} Merci de prendre deux minutes pour répondre à ce court questionnaire :</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${lien}" style="background:#2F72DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Répondre au questionnaire</a>
    </p>
    <p style="font-size:13px;color:#667">Si le bouton ne fonctionne pas, copiez ce lien : <br>${lien}</p>
    <p>Merci, et belle réussite !<br>L'équipe MYSTORY Formation</p>`;

  const envoi = await envoyerEmail({ a: email, objet: titre, html: gabaritEmail(titre, corps) });
  if (!envoi.ok) return NextResponse.json({ ok: false, erreur: envoi.erreur || "Envoi impossible." }, { status: 502 });

  if (type === "froid") {
    await supabaseAdmin.from("dossiers").update({ satisfaction_froid_envoyee_le: new Date().toISOString() }).eq("id", dossierId);
  }
  await journal("dossier", dossierId, type === "chaud" ? "satisfaction_chaud_envoyee" : "satisfaction_froid_envoyee", { email }, u.email ?? null);

  return NextResponse.json({ ok: true, email });
}
