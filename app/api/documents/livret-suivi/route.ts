/**
 * MYSTORY — GET /api/documents/livret-suivi?dossier=<id>
 * Génère le « Livret de suivi du stagiaire » (TEF IRN) en PDF, pré-rempli depuis le CRM
 * (couverture, positionnement, séances, résultats). À imprimer ou archiver. Auth équipe.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { genererLivretSuiviHtml } from "@/lib/livretSuivi";
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
  const dossierId = (req.nextUrl.searchParams.get("dossier") ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "Paramètre « dossier » requis." }, { status: 400 });

  try {
    const html = await genererLivretSuiviHtml(dossierId);
    if (!html) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
    const pdf = await renderPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="livret_suivi.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
