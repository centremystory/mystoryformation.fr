/**
 * MYSTORY — /api/cron/relances-anomalie · Relances CANDIDAT issues des anomalies.
 * Couvre : paiement en attente (examen) · convention non signée (> 14 j).
 * Anti-harcèlement : dedup 7 jours + plafond 3 relances par cible (table relances_anomalie).
 * GET  → ce qui serait relancé (compte), sans envoyer.
 * POST → envoie + journalise. ?dryRun=1 calcule sans envoyer.
 * Appelé par n8n (Bearer). Personnes DÉJÀ inscrites = suivi de dossier (pas du démarchage).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { chargerAnomaliesExamen, chargerAnomaliesFormation, nomCompletVente } from "@/lib/anomalies";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const DEDUP_JOURS = 7;
const PLAFOND = 3;

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

function frDate(iso: string | null): string {
  if (!iso) return "prochainement";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
const eur = (n: number | null | undefined) => `${Math.round(Number(n ?? 0))} €`;

type Cible = { type: "paiement" | "convention"; id: string; email: string; prenom: string; nom: string; objet: string; html: string };

/** Construit la liste des cibles à relancer (avant dedup). */
async function cibles(): Promise<Cible[]> {
  const [ex, form] = await Promise.all([chargerAnomaliesExamen(""), chargerAnomaliesFormation("")]);
  const out: Cible[] = [];

  // — Paiements en attente (examen) —
  for (const v of ex.paiements) {
    const email = v.stagiaires?.email?.trim();
    if (!email) continue;
    const prenom = v.stagiaires?.prenom ?? "";
    const type = v.sessions_examen?.type === "Examen_civique" ? "civique" : "TEF IRN";
    const corps = `Bonjour ${prenom || "Madame, Monsieur"},<br><br>
      Il reste <strong>${eur(v.reste_a_payer)}</strong> à régler pour votre examen ${type} prévu le <strong>${frDate(v.sessions_examen?.date_examen ?? null)}</strong>.<br>
      Merci de régulariser avant la date d'examen. Pour toute question, contactez-nous au 06 81 43 16 54 ou répondez à cet email.<br><br>
      Cordialement,<br>L'équipe MYSTORY`;
    out.push({ type: "paiement", id: v.id, email, prenom, nom: v.stagiaires?.nom ?? "", objet: "MYSTORY — Solde à régler pour votre examen", html: gabaritEmail("Solde à régler", corps) });
  }

  // — Conventions non signées (> 14 j) : récupérer les emails des dossiers concernés —
  if (form.conventions.length) {
    const ids = form.conventions.map((c) => c.dossier_id);
    const { data: doss } = await supabaseAdmin
      .from("dossiers")
      .select("id, stagiaire:stagiaires!stagiaire_id ( email, prenom, nom )")
      .in("id", ids);
    const parDossier = new Map<string, { email: string | null; prenom: string | null; nom: string | null }>();
    for (const d of ((doss as any[]) ?? [])) {
      const s = Array.isArray(d.stagiaire) ? d.stagiaire[0] : d.stagiaire;
      parDossier.set(d.id, { email: s?.email ?? null, prenom: s?.prenom ?? null, nom: s?.nom ?? null });
    }
    for (const c of form.conventions) {
      const s = parDossier.get(c.dossier_id);
      const email = s?.email?.trim();
      if (!email) continue;
      const prenom = s?.prenom ?? c.prenom ?? "";
      const corps = `Bonjour ${prenom || "Madame, Monsieur"},<br><br>
        Votre convention de formation est en attente de signature. Merci de la signer dès que possible
        (vérifiez vos emails, y compris le dossier « indésirables », pour le lien de signature).<br>
        Pour toute question : 06 81 43 16 54.<br><br>
        Cordialement,<br>L'équipe MYSTORY`;
      out.push({ type: "convention", id: c.dossier_id, email, prenom, nom: s?.nom ?? c.nom ?? "", objet: "MYSTORY — Convention de formation à signer", html: gabaritEmail("Convention à signer", corps) });
    }
  }

  return out;
}

/** Map clé `type:id` → { count, last } sur les relances déjà émises (actives). */
async function historique(): Promise<Map<string, { count: number; last: number }>> {
  const { data } = await supabaseAdmin
    .from("relances_anomalie")
    .select("cible_type, cible_id, envoye_le")
    .eq("actif", true);
  const m = new Map<string, { count: number; last: number }>();
  for (const r of ((data as any[]) ?? [])) {
    const k = `${r.cible_type}:${r.cible_id}`;
    const t = new Date(r.envoye_le).getTime();
    const cur = m.get(k) ?? { count: 0, last: 0 };
    cur.count += 1;
    cur.last = Math.max(cur.last, t);
    m.set(k, cur);
  }
  return m;
}

/** Décision dedup : envoyer ? sinon raison ('recent' | 'plafond'). */
function aEnvoyer(h: Map<string, { count: number; last: number }>, c: Cible): { ok: boolean; raison?: string } {
  const e = h.get(`${c.type}:${c.id}`);
  if (!e) return { ok: true };
  if (e.count >= PLAFOND) return { ok: false, raison: "plafond" };
  if (Date.now() - e.last < DEDUP_JOURS * 86400000) return { ok: false, raison: "recent" };
  return { ok: true };
}

async function executer(req: NextRequest, envoiReel: boolean) {
  const [liste, h] = await Promise.all([cibles(), historique()]);
  const res = {
    paiement: { envoyes: 0, ignores: 0 },
    convention: { envoyes: 0, ignores: 0 },
    erreurs: [] as string[],
  };

  for (const c of liste) {
    const d = aEnvoyer(h, c);
    if (!d.ok) { res[c.type].ignores += 1; continue; }
    if (!envoiReel) { res[c.type].envoyes += 1; continue; }

    const envoi = await envoyerEmail({ a: c.email, objet: c.objet, html: c.html });
    if (envoi.ok) {
      await supabaseAdmin.from("relances_anomalie").insert({
        cible_type: c.type, cible_id: c.id, candidat: `${c.prenom} ${c.nom}`.trim(), email: c.email,
        motif: c.type === "paiement" ? "Solde à régler" : "Convention à signer", envoye_par: "cron-relances",
      });
      res[c.type].envoyes += 1;
      // évite un 2e envoi à la même cible dans la même passe
      h.set(`${c.type}:${c.id}`, { count: (h.get(`${c.type}:${c.id}`)?.count ?? 0) + 1, last: Date.now() });
    } else {
      res[c.type].ignores += 1;
      res.erreurs.push(`${c.email}: ${envoi.erreur ?? "échec"}`);
    }
  }
  return res;
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const res = await executer(req, false);
  return NextResponse.json({ ok: true, apercu: true, ...res });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const res = await executer(req, !dryRun);
  if (!dryRun) {
    await journal("relances_anomalie", "cron", "relances_envoyees", res as any, g.email ?? "cron-relances");
  }
  return NextResponse.json({ ok: true, dryRun, ...res });
}
