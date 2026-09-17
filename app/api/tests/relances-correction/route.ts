/**
 * MYSTORY — /api/tests/relances-correction · les copies qui attendent leur note.
 *
 * 17/09/2026. On promet au candidat un résultat « sous 24 à 48 heures », et rien ne
 * surveillait ce délai : une copie pouvait rester en `en_attente_formateur` des
 * semaines sans que personne ne soit prévenu. La relance existante ne couvre que
 * les tests NON PASSÉS (`statut = en_cours`) — l'angle mort était juste après.
 *
 * GET  → ce qui serait relancé, sans rien envoyer.
 * POST → un seul récapitulatif à la boîte des corrections, avec le lien direct de
 *        notation de chaque copie. Appelé chaque matin par /api/cron/tick.
 *
 * Volontairement un DIGEST quotidien et non un rappel par copie : tant qu'une copie
 * traîne, le rappel revient. C'est ce qu'on veut — il s'arrête quand elle est notée.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { lienCorrection } from "@/lib/jetonCorrection";
import { journal } from "@/lib/examens";
import { urlDeBase } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Au-delà de ce délai, la copie est en retard sur ce qu'on a promis au candidat. */
const SEUIL_HEURES = 24;

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    }
    throw e;
  }
}

type EnRetard = {
  id: string; candidat: string; email: string | null; telephone: string | null;
  heures: number; phase: string; lien: string;
};

async function enRetard(base: string): Promise<EnRetard[]> {
  const limite = new Date(Date.now() - SEUIL_HEURES * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("evaluations")
    .select("id, phase, nom, prenom, civilite, email, telephone, cree_le")
    .eq("statut", "en_attente_formateur")
    .lt("cree_le", limite)
    .order("cree_le", { ascending: true })
    .limit(100);

  return (data ?? []).map((e: any) => ({
    id: e.id,
    candidat: [e.civilite, e.prenom, e.nom].filter(Boolean).join(" ").trim() || "Candidat sans nom",
    email: e.email ?? null,
    telephone: e.telephone ?? null,
    heures: Math.floor((Date.now() - new Date(e.cree_le).getTime()) / 3600_000),
    phase: e.phase,
    lien: lienCorrection(base, e.id),
  }));
}

export async function GET(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const copies = await enRetard(urlDeBase(req));
  return NextResponse.json({ ok: true, apercu: true, seuil_heures: SEUIL_HEURES, total: copies.length, copies });
}

export async function POST(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const auteur = (g as SessionUser).email ?? "cron";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const copies = await enRetard(urlDeBase(req));
  if (!copies.length) {
    return NextResponse.json({ ok: true, envoye: false, total: 0, message: "Aucune copie en retard." });
  }
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, total: copies.length, copies });

  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

  const lignes = copies.map((c) => `
    <tr>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eef1f6">
        <b>${esc(c.candidat)}</b>
        ${c.telephone ? `<br><span style="color:#6b7280;font-size:13px">${esc(c.telephone)}</span>` : ""}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;white-space:nowrap;color:${c.heures >= 48 ? "#b4462a" : "#b45309"};font-weight:600">
        ${c.heures} h d'attente
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eef1f6;white-space:nowrap">
        ${c.lien ? `<a href="${c.lien}" style="color:#2F72DE;font-weight:600">corriger</a>` : "—"}
      </td>
    </tr>`).join("");

  const audela = copies.filter((c) => c.heures >= 48).length;
  const corps = `
    <p style="margin:0 0 14px">
      <b>${copies.length} copie${copies.length > 1 ? "s" : ""}</b> attend${copies.length > 1 ? "ent" : ""}
      sa note depuis plus de ${SEUIL_HEURES} heures${audela ? `, dont <b style="color:#b4462a">${audela} depuis plus de 48 h</b>` : ""}.
      Nous annonçons au candidat un résultat « sous 24 à 48 heures ».
    </p>
    <table style="border-collapse:collapse;font-size:14px;width:100%">${lignes}</table>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280">
      Chaque lien ouvre l'écran de notation <b>sans connexion</b>, depuis un téléphone.
      Ce rappel revient chaque matin tant qu'une copie reste à corriger.</p>`;

  const envoi = await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "contact@mystoryformation.fr",
    objet: `${copies.length} copie${copies.length > 1 ? "s" : ""} à corriger — la plus ancienne attend depuis ${copies[0].heures} h`,
    html: gabaritEmail("Des copies attendent leur note", corps),
    entite: "evaluations", auteur: "systeme",
  });

  await journal("evaluation", null, "relance_correction", {
    total: copies.length, au_dela_48h: audela, envoye: !!envoi.ok,
    ids: copies.map((c) => c.id),
  }, auteur);

  return NextResponse.json({ ok: !!envoi.ok, envoye: !!envoi.ok, total: copies.length, au_dela_48h: audela });
}
