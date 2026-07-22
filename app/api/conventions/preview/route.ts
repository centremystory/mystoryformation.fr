/**
 * MYSTORY — GET /api/conventions/preview?dossier=<uuid>
 * APERÇU de la convention AVANT envoi en signature : rendu pur HTML → PDF, renvoyé inline.
 * Ne crée AUCUNE demande de signature, n'archive rien, ne change PAS le statut de la pièce
 * (le bouton « Envoyer à signer » reste donc disponible). Sert à vérifier avant d'envoyer.
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Neutralise les balises de signature DocuSeal → simples traits, pour un aperçu non signable. */
function neutraliserSignature(html: string): string {
  return html
    .replace(/<signature-field\b[^>]*><\/signature-field>/g, '<span style="display:inline-block;border-bottom:1px solid #94a3b8;width:200px;height:36px"></span>')
    .replace(/<date-field\b[^>]*><\/date-field>/g, '<span style="display:inline-block;border-bottom:1px solid #94a3b8;width:100px">&nbsp;</span>');
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const dossierId = req.nextUrl.searchParams.get("dossier")?.trim();
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "Paramètre requis : dossier." }, { status: 400 });

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const merge = mergeTemplate("convention", fiche);
  if (merge.missing.length > 0) {
    return NextResponse.json(
      { ok: false, status: "champs_manquants", recap: merge.missing.map((m) => `Champ requis manquant : ${m}`) },
      { status: 409 },
    );
  }

  try {
    const { pdf } = await renderHtmlToPdf({ html: neutraliserSignature(merge.html), name: `Convention (aperçu) — ${fiche.prenom} ${fiche.nom}` });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="convention-apercu-${(fiche.nom ?? "dossier").toLowerCase()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, status: "erreur", erreur: String(e) }, { status: 502 });
  }
}
