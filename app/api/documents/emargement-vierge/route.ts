/**
 * MYSTORY — GET /api/documents/emargement-vierge?dossier=<uuid>
 * Feuille d'émargement VIERGE d'un dossier (fallback papier si ordinateur/wifi en panne) :
 * séances planifiées + cases à signer vides. À imprimer, faire signer, puis importer le scan
 * (fiche du dossier → pièce « Feuille d'émargement » → « Importer (papier signé) »).
 * Ne modifie rien. Protégé par le middleware + requireUser.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { genererFeuilleEmargementViergeDossierHtml } from "@/lib/emargement";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const dossierId = (req.nextUrl.searchParams.get("dossier") ?? "").trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "Paramètre dossier requis." }, { status: 400 });

  const feuille = await genererFeuilleEmargementViergeDossierHtml(dossierId);
  if (!feuille) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  try {
    const { pdf } = await renderHtmlToPdf({ html: feuille.html, name: `emargement-vierge-${dossierId}.pdf` });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="feuille-emargement-vierge.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: `Génération impossible : ${e?.message ?? e}` }, { status: 502 });
  }
}
