/**
 * MYSTORY — GET /api/emargement/feuille/pdf?dossier=<id>
 * Télécharge la feuille d'émargement RÉELLE d'un stagiaire (récap des demi-journées
 * émargées, avec les signatures recueillies). Produite à partir du réel, jamais pré-remplie :
 * si aucune demi-journée n'est émargée → 409. Auth obligatoire.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { genererFeuilleEmargementHtml } from "@/lib/emargement";
import { renderHtmlToPdf } from "@/lib/docuseal";

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
    const feuille = await genererFeuilleEmargementHtml(dossierId);
    if (!feuille) {
      return NextResponse.json({ ok: false, erreur: "Aucune demi-journée émargée pour ce stagiaire : la feuille ne peut pas être générée (interdiction de pré-remplir)." }, { status: 409 });
    }
    const { pdf } = await renderHtmlToPdf({ html: feuille.html, name: `emargement ${dossierId}` });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="feuille_emargement.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
