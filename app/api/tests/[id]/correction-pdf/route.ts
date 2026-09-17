/**
 * MYSTORY — GET /api/tests/[id]/correction-pdf
 * Correction détaillée du test (décision Direction 10/07) : question par question,
 * réponse du candidat vs bonne réponse, points, EE/EO notées, total et niveau.
 * DOCUMENT INTERNE (auth équipe) : contient les corrigés de la banque → à remettre
 * en main propre au candidat, jamais envoyé par email automatique au candidat.
 *
 * 17/09/2026 — le document lui-même est construit par lib/correctionPdf.ts, pour que
 * l'e-mail interne envoyé à la notation joigne EXACTEMENT le même PDF que ce bouton.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { construireCorrectionPdf, estEchec } from "@/lib/correctionPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const r = await construireCorrectionPdf(params.id);
  if (estEchec(r)) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: r.code });

  return new NextResponse(new Uint8Array(r.contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
