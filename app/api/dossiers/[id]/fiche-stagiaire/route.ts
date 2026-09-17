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
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { construireFicheStagiaire, echecFiche, type Destinataire } from "@/lib/ficheStagiaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 17/09/2026 — même liste que la page /dossiers dans lib/roles.ts.
 *
 * Cette fiche porte les données personnelles du stagiaire — nom, date et lieu de
 * naissance, adresse, téléphone, courriel — et, en version équipe, l'état de
 * conformité de son dossier. Elle ne doit donc pas être plus ouverte que la page
 * d'où elle est imprimée : le CRM refuse déjà /dossiers au rôle « commercial »,
 * cette route fait pareil, au lieu de se contenter d'une session valide.
 *
 * (Il n'y a ni propriétaire ni agence sur un dossier dans ce CRM : le contrôle
 * porte sur le métier de la personne, pas sur un lien avec le dossier. Vérifié :
 * tous les comptes actifs portent back_office et formatrice, aucun n'est perdu.)
 */
const ROLES_DOSSIERS = ["direction", "manager", "back_office", "formatrice"] as const;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireRole(req, ROLES_DOSSIERS); } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 403 });
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
