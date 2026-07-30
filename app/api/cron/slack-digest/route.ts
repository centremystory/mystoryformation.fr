/**
 * MYSTORY — Digest Slack (routage CRM → bons canaux). Appelé périodiquement (n8n/cron,
 * Bearer JWT de service) ; protégé par le middleware global (session équipe ou Bearer cron).
 * Route les alertes CRM vers le canal Slack dédié — chaque canal a son incoming webhook :
 *   - Conformité EDOF/Qualiopi (dossiers à corriger)   → SLACK_WEBHOOK_CONFORMITE   (#conformite)
 *   - Absences sans motif (suivi des présences)         → SLACK_WEBHOOK_PEDAGOGIE     (#pedagogie)
 *   - Réclamations à traiter                            → SLACK_WEBHOOK_RECLAMATIONS  (#reclamations)
 * N'envoie que si le webhook est configuré ET qu'il y a quelque chose à signaler.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scannerConformiteEdof } from "@/lib/conformiteEdof";
import { postSlack } from "@/lib/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRM = process.env.NEXT_PUBLIC_APP_URL || "https://crm.mystoryformation.fr";

export async function GET(_req: NextRequest) {
  const resultats: Record<string, unknown> = {};

  // 1) Conformité EDOF/Qualiopi → #conformite
  try {
    const risques = await scannerConformiteEdof();
    const hautes = risques.reduce((s, r) => s + r.anomalies.filter((a) => a.gravite === "haute").length, 0);
    if (risques.length > 0) {
      const posted = await postSlack(process.env.SLACK_WEBHOOK_CONFORMITE,
        `:rotating_light: *Conformité EDOF / Qualiopi* — *${risques.length}* dossier(s) à corriger · *${hautes}* anomalie(s) critique(s).\nScanner → ${CRM}/dossiers/conformite`);
      resultats.conformite = { dossiers: risques.length, hautes, posted };
    } else resultats.conformite = { dossiers: 0 };
  } catch (e) { resultats.conformite = { erreur: String(e) }; }

  // 2) Absences sans motif → #pedagogie
  try {
    const { count } = await supabaseAdmin.from("planning").select("id", { count: "exact", head: true })
      .eq("absence", true).or("absence_motif.is.null,absence_motif.eq.");
    const n = count ?? 0;
    if (n > 0) {
      const posted = await postSlack(process.env.SLACK_WEBHOOK_PEDAGOGIE,
        `:memo: *Suivi des présences* — *${n}* absence(s) sans motif à justifier.\nPlanning → ${CRM}/planning`);
      resultats.pedagogie = { absences: n, posted };
    } else resultats.pedagogie = { absences: 0 };
  } catch (e) { resultats.pedagogie = { erreur: String(e) }; }

  // 3) Réclamations à traiter → #reclamations
  try {
    const { count } = await supabaseAdmin.from("reclamations").select("id", { count: "exact", head: true })
      .eq("actif", true).neq("statut", "resolue");
    const n = count ?? 0;
    if (n > 0) {
      const posted = await postSlack(process.env.SLACK_WEBHOOK_RECLAMATIONS,
        `:speech_balloon: *Réclamations* — *${n}* à traiter.\nOuvrir → ${CRM}/reclamations`);
      resultats.reclamations = { reclamations: n, posted };
    } else resultats.reclamations = { reclamations: 0 };
  } catch (e) { resultats.reclamations = { erreur: String(e) }; }

  return NextResponse.json({ ok: true, resultats });
}
