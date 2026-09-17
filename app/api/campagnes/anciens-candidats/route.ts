/**
 * MYSTORY — POST /api/campagnes/anciens-candidats
 *
 * 17/09/2026. La campagne vers les anciens candidats aux examens.
 *
 * Trois modes, du plus sûr au plus engageant — l'ordre n'est pas décoratif :
 *   { apercu: true }          → ne fait RIEN. Dit combien de personnes, et rend
 *                               le message tel qu'il partira. C'est le défaut.
 *   { test: "adresse@…" }     → envoie UN message à cette adresse seulement.
 *   { lot: 100 }              → envoie réellement à 100 personnes, puis s'arrête.
 *
 * Le mode réel est volontairement PAR LOTS et jamais « tout d'un coup ». 1 064
 * messages d'affilée depuis une boîte IONOS font classer le domaine en expéditeur
 * de masse ; le jour où cela arrive, ce ne sont pas les campagnes qui tombent,
 * ce sont les convocations.
 *
 * Réservé à la direction : c'est un acte commercial vers plus de mille personnes,
 * qu'aucune annulation ne rattrape.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import {
  CAMPAGNE, corpsMessage, destinataires, envoyerLot,
} from "@/lib/campagneAnciensCandidats";
import { envoyerEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Plafond par appel : au-delà, la fonction dépasserait maxDuration avec les pauses. */
const LOT_MAX = 120;

export async function POST(req: NextRequest) {
  try { await requireRole(req, ["direction"] as const); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction." }, { status: 403 });
    throw e;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* corps vide = aperçu */ }

  // ── Aperçu (défaut) ──────────────────────────────────────────────────────
  if (body?.lot == null && !body?.test) {
    const liste = await destinataires(5000);
    return NextResponse.json({
      ok: true,
      mode: "apercu",
      campagne: CAMPAGNE,
      destinataires_restants: liste.length,
      exemple: liste[0] ?? null,
      apercu_html: liste[0] ? corpsMessage(liste[0]) : corpsMessage({ email: "exemple@exemple.fr", prenom: "Marie" }),
    });
  }

  // ── Test : un seul message, à l'adresse demandée ─────────────────────────
  if (body?.test) {
    const a = String(body.test).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) {
      return NextResponse.json({ ok: false, erreur: "Adresse de test invalide." }, { status: 400 });
    }
    const r = await envoyerEmail({
      a,
      objet: "[TEST] Votre examen chez MYSTORY — et la suite, si vous le souhaitez",
      html: corpsMessage({ email: a, prenom: String(body.prenom ?? "") || null }),
      entite: "campagne_test",
      entiteId: CAMPAGNE,
    });
    return NextResponse.json({ ok: r.ok, mode: "test", a, erreur: r.erreur ?? null });
  }

  // ── Envoi réel, par lot ──────────────────────────────────────────────────
  const lot = Math.min(Math.max(1, Number(body.lot) || 0), LOT_MAX);
  const bilan = await envoyerLot(lot);
  return NextResponse.json({ ok: true, mode: "envoi", campagne: CAMPAGNE, ...bilan });
}
