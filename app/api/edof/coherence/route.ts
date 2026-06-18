/**
 * MYSTORY — GET /api/edof/coherence  (contrôle de cohérence EDOF ↔ CRM, auth obligatoire)
 * Lecture seule : aucune écriture. Rapproche l'archive EDOF, la facturation CRM et signale les anomalies.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { coherenceEdof } from "@/lib/edof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  try {
    const rapport = await coherenceEdof();
    return NextResponse.json({ ok: true, rapport });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
