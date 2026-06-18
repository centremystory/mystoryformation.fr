/**
 * MYSTORY — GET /api/emargement/jour/pdf?date=YYYY-MM-DD
 * Génère la feuille d'émargement PAPIER (vierge de signatures) du jour, à imprimer puis signer
 * en présentiel. Lieu unique : Gagny. Auth obligatoire.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { genererFeuillePapierJourHtml } from "@/lib/emargement";
import { renderPdf } from "@/lib/renderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const date = (req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, erreur: "Date invalide (YYYY-MM-DD)." }, { status: 400 });
  }
  try {
    const { html } = await genererFeuillePapierJourHtml(date);
    const pdf = await renderPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="emargement_papier_${date}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
