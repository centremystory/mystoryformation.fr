/**
 * MYSTORY — GET /api/dossiers/[id]/fiche-stagiaire?pour=equipe|stagiaire
 *
 * La fiche stagiaire en PDF, générée depuis le dossier. Elle remplace trois gestes
 * manuels : les informations écrites au stylo sur la photocopie de la pièce
 * d'identité, la couverture du classeur papier, et la fiche recopiée à la main.
 *
 * `pour=equipe` (défaut) : porte la checklist des pièces et dit ce qui manque.
 *                          Document interne — ne se remet pas au stagiaire.
 * `pour=stagiaire`        : ce qu'il emporte, sans la checklist.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { construireFicheStagiaire, echecFiche, type Destinataire } from "@/lib/ficheStagiaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    throw e;
  }

  const demande = req.nextUrl.searchParams.get("pour");
  // Par défaut la version ÉQUIPE : c'est elle qui sert au quotidien, et se tromper
  // dans ce sens ne montre jamais au stagiaire ce qu'il ne doit pas voir.
  const pour: Destinataire = demande === "stagiaire" ? "stagiaire" : "equipe";

  const r = await construireFicheStagiaire(params.id, pour);
  if (echecFiche(r)) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: r.code });

  return new NextResponse(new Uint8Array(r.contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
