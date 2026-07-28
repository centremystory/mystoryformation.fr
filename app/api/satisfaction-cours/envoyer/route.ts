/**
 * MYSTORY — /api/satisfaction-cours/envoyer  (satisfaction à chaud AUTO aux présents du jour)
 *  GET  → nombre de présents du jour restant à solliciter (aperçu du bouton).
 *  POST → envoie le questionnaire à chaud (lien /avis-cours?token=) aux stagiaires ÉMARGÉS
 *         aujourd'hui et pas encore sollicités. Un email par stagiaire/jour. Idempotent via
 *         planning.satisfaction_chaud_envoyee_le. Appelable par la session équipe OU le cron
 *         (jeton de service). Verrou d'idempotence = aucun double envoi.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function aujourdParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function baseUrl(req: NextRequest): string {
  const app = process.env.APP_URL?.trim();
  if (app) return app.replace(/\/+$/, "");
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v}`;
  return req.nextUrl.origin;
}

/** Séances émargées aujourd'hui, pas encore sollicitées, avec un email stagiaire. */
async function presentsDuJour() {
  const today = aujourdParisISO();
  const { data } = await supabaseAdmin
    .from("planning")
    .select("id, dossier_id, emargement_token, dossier:dossiers!dossier_id ( stagiaire:stagiaires!stagiaire_id ( prenom, email ) )")
    .eq("date_seance", today)
    .not("emarge_le", "is", null)
    .is("satisfaction_chaud_envoyee_le", null);
  const rows = (data ?? []) as any[];
  // Un stagiaire = un envoi/jour : on garde la 1re séance émargée par dossier ayant un email.
  const parDossier = new Map<string, { seanceId: string; dossierId: string; token: string; prenom: string | null; email: string }>();
  for (const r of rows) {
    const email = r.dossier?.stagiaire?.email;
    if (!email || parDossier.has(r.dossier_id)) continue;
    parDossier.set(r.dossier_id, {
      seanceId: r.id, dossierId: r.dossier_id, token: r.emargement_token,
      prenom: r.dossier?.stagiaire?.prenom ?? null, email,
    });
  }
  return { today, cibles: Array.from(parDossier.values()) };
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) { if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 }); throw e; }
  const { cibles } = await presentsDuJour();
  return NextResponse.json({ ok: true, presents: cibles.length });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) { if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 }); throw e; }

  const { today, cibles } = await presentsDuJour();
  const base = baseUrl(req);
  let envoyes = 0;
  const dossiersOk: string[] = [];

  for (const c of cibles) {
    const lien = `${base}/avis-cours?token=${encodeURIComponent(c.token)}`;
    const prenom = String(c.prenom ?? "").replace(/</g, "&lt;");
    const res = await envoyerEmail({
      a: c.email,
      objet: "Votre cours du jour chez MYSTORY — votre avis en 30 secondes",
      html: gabaritEmail("Comment s'est passé votre cours ?", `
        <p>Bonjour ${prenom},</p>
        <p>Merci d'avoir participé à votre cours aujourd'hui chez MYSTORY. Votre avis « à chaud » nous aide à progresser.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${lien}" style="background:#2F72DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block;">Donner mon avis (30 s)</a>
        </p>
        <p style="color:#667085;font-size:13px;">Ou copiez ce lien : ${lien}</p>
        <p>À très bientôt,<br>L'équipe MYSTORY Formation</p>`),
      entite: "dossier", entiteId: c.dossierId, auteur: "satisfaction-chaud-auto",
    });
    if (res.ok) { envoyes++; dossiersOk.push(c.dossierId); }
  }

  // Marque TOUTES les séances émargées du jour des dossiers sollicités (évite tout renvoi).
  if (dossiersOk.length) {
    await supabaseAdmin.from("planning")
      .update({ satisfaction_chaud_envoyee_le: new Date().toISOString() })
      .eq("date_seance", today)
      .not("emarge_le", "is", null)
      .in("dossier_id", dossiersOk);
  }

  await journal("satisfaction_seance", null, "satisfaction_chaud_envoi_auto",
    { date: today, cibles: cibles.length, envoyes }, u.email ?? null);
  return NextResponse.json({ ok: true, cibles: cibles.length, envoyes });
}
