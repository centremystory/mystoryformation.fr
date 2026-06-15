/**
 * MYSTORY — GET /api/dossiers/conformite-edof
 * Scanner de conformité : tous les dossiers à risque avant un contrôle EDOF/Qualiopi.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { scannerConformiteEdof } from "@/lib/conformiteEdof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const dossiers = await scannerConformiteEdof();
  const anomaliesHautes = dossiers.reduce((n, d) => n + d.anomalies.filter((a) => a.gravite === "haute").length, 0);
  return NextResponse.json({ ok: true, total: dossiers.length, anomalies_hautes: anomaliesHautes, dossiers });
}
