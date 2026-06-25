/**
 * MYSTORY — /api/cron/anomalies · Digest interne quotidien des anomalies.
 * GET  → aperçu JSON (compte par catégorie), n'envoie rien.
 * POST → envoie le digest à l'équipe (boîte interne). ?dryRun=1 calcule sans envoyer.
 * Appelé par n8n (Bearer JWT de service). 100 % interne : aucun email candidat ici.
 * Protégé par le middleware global (session équipe ou Bearer n8n/cron).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { chargerAnomaliesExamen, chargerAnomaliesFormation, nomCompletVente, type Vente } from "@/lib/anomalies";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DESTINATAIRE = process.env.ANOMALIES_DIGEST_TO ?? "contact@mystoryformation.fr";
const APP_URL = process.env.APP_URL ?? "https://crm.mystoryformation.fr";
const MAX_LISTE = 15;

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

function frDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}
const eur = (n: number | null | undefined) => `${Math.round(Number(n ?? 0))} €`;

async function calculer() {
  // Digest global, tous sites confondus (site = "").
  const [ex, form] = await Promise.all([chargerAnomaliesExamen(""), chargerAnomaliesFormation("")]);
  const total =
    ex.convocations.length + ex.paiements.length + ex.doublons.length +
    form.emargements.length + form.conventions.length + form.doublons.length;
  return { ex, form, total };
}

function bloc(titre: string, n: number, lignesHtml: string): string {
  const couleur = n > 0 ? "#b45309" : "#16a34a";
  return `<tr><td style="padding:10px 0 4px;">
    <span style="font-size:14px;font-weight:700;color:#1f2430;">${titre}</span>
    <span style="display:inline-block;margin-left:8px;font-size:12px;font-weight:700;color:${couleur};">${n}</span>
  </td></tr>${n > 0 ? `<tr><td style="padding:0 0 8px;">${lignesHtml}</td></tr>` : `<tr><td style="padding:0 0 8px;font-size:12px;color:#16a34a;">Rien à signaler.</td></tr>`}`;
}
function listeNoms(items: string[]): string {
  const visibles = items.slice(0, MAX_LISTE);
  const reste = items.length - visibles.length;
  return `<div style="font-size:12.5px;color:#444;line-height:1.7;">${visibles.map((s) => `• ${s}`).join("<br>")}${reste > 0 ? `<br><em style="color:#888;">… et ${reste} autre${reste > 1 ? "s" : ""}</em>` : ""}</div>`;
}

function digestHtml(d: Awaited<ReturnType<typeof calculer>>): string {
  const { ex, form, total } = d;
  const lib = (v: Vente) => `${nomCompletVente(v)} — ${v.sessions_examen?.type === "Examen_civique" ? "Civique" : "TEF IRN"} ${frDate(v.sessions_examen?.date_examen ?? null)}`;

  const corps = `
    <p style="font-size:14px;color:#444;margin:0 0 4px;">Récapitulatif des points à traiter, tous sites confondus.</p>
    <p style="font-size:13px;color:#666;margin:0 0 16px;"><strong>${total}</strong> anomalie${total > 1 ? "s" : ""} au total.</p>

    <p style="font-size:12px;font-weight:700;color:#2F72DE;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 0;">Examen</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      ${bloc("Convocations à envoyer", ex.convocations.length, listeNoms(ex.convocations.map(lib)))}
      ${bloc("Paiements en attente", ex.paiements.length, listeNoms(ex.paiements.map((v) => `${nomCompletVente(v)} — reste ${eur(v.reste_a_payer)} (${frDate(v.sessions_examen?.date_examen ?? null)})`)))}
      ${bloc("Doublons (examen)", ex.doublons.length, listeNoms(ex.doublons.map((g) => `${nomCompletVente(g[0])} — ${g.length} ventes même session`)))}
    </table>

    <p style="font-size:12px;font-weight:700;color:#2F72DE;text-transform:uppercase;letter-spacing:.5px;margin:18px 0 0;">Formation</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;">
      ${bloc("Émargements manquants", form.emargements.length, listeNoms(form.emargements.map((s) => `${`${s.prenom} ${s.nom}`.trim() || "Stagiaire"} — séance du ${frDate(s.date_seance)}${s.demi_journee ? ` (${s.demi_journee})` : ""}`)))}
      ${bloc("Conventions non signées (> 14 j)", form.conventions.length, listeNoms(form.conventions.map((c) => `${`${c.prenom} ${c.nom}`.trim() || "Stagiaire"} — envoyée le ${frDate(c.envoyee_le)}`)))}
      ${bloc("Doublons (stagiaires)", form.doublons.length, listeNoms(form.doublons.map((x) => `${`${x.prenom} ${x.nom}`.trim() || "Stagiaire"} — ${x.n} dossiers en cours`)))}
    </table>

    <div style="margin-top:22px;">
      <a href="${APP_URL}/anomalies" style="display:inline-block;background:#2F72DE;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">Ouvrir les anomalies</a>
    </div>`;

  return gabaritEmail("Anomalies du jour", corps);
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const { ex, form, total } = await calculer();
  return NextResponse.json({
    ok: true,
    total,
    examen: { convocations: ex.convocations.length, paiements: ex.paiements.length, doublons: ex.doublons.length },
    formation: { emargements: form.emargements.length, conventions: form.conventions.length, doublons: form.doublons.length },
  });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const d = await calculer();

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, total: d.total, destinataire: DESTINATAIRE, apercu_html_taille: digestHtml(d).length });
  }

  const envoi = await envoyerEmail({
    a: DESTINATAIRE,
    objet: `MYSTORY — Anomalies du jour (${d.total})`,
    html: digestHtml(d),
  });
  await journal("anomalies", "digest", "digest_envoye", { total: d.total, destinataire: DESTINATAIRE, envoye: envoi.ok, erreur: envoi.erreur ?? null }, g.email ?? "cron-anomalies");

  return NextResponse.json({ ok: envoi.ok, total: d.total, destinataire: DESTINATAIRE, erreur: envoi.erreur });
}
