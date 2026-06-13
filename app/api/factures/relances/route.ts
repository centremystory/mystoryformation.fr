/**
 * MYSTORY — /api/factures/relances  (relances J+7 / J+15 — §6)
 * GET  — liste les relances dues aujourd'hui (idempotent, sans effet — pour contrôle n8n).
 * POST — exécute les relances dues : email + statut relance_1/relance_2 + journal.
 *        Idempotent jour après jour : une facture relancée change de statut et
 *        ne redevient « due » qu'au palier suivant. Jamais de relance CPF
 *        (payeur = CDC) ni sur facture payée — filtré dans lib/factures.
 * Protégé par le middleware global (session équipe ou Bearer JWT n8n/cron).
 * Restriction : exécuter les relances = action « facturation » (Direction + Secrétariat ; cron sans rôle passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { relancesDues, envoyerFacture } from "@/lib/factures";

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

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const dues = await relancesDues();
  return NextResponse.json({ ok: true, dues });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (g.role && !peut(g.role, "facturation")) {
    return NextResponse.json({ ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." }, { status: 403 });
  }
  const auteur = "relances-auto";
  const dues = await relancesDues();

  const resultats: Array<{ numero: string; mode: string; envoye: boolean; erreur?: string }> = [];
  for (const r of dues) {
    const envoi = await envoyerFacture(r.factureId, r.mode, auteur);
    resultats.push({ numero: r.numero, mode: r.mode, envoye: envoi.ok, erreur: envoi.erreur });
  }

  return NextResponse.json({
    ok: true,
    total: dues.length,
    envoyees: resultats.filter((r) => r.envoye).length,
    resultats,
  });
}
