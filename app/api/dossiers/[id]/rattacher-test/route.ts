/**
 * MYSTORY — POST /api/dossiers/[id]/rattacher-test
 *
 * Rattache au dossier le test de positionnement que la personne a déjà passé sur
 * test.mystoryformation.fr, inscrit son niveau d'entrée et génère la pièce Qualiopi.
 *
 * Ne crée JAMAIS de dossier : la qualification d'un prospect reste humaine.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { rattacherTestAuDossier, echecRattachement } from "@/lib/rattacherTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 17/09/2026 — rôle exigé, pas seulement une session.
 *
 * Ce point d'entrée ne fait pas que lire : il inscrit le NIVEAU D'ENTRÉE du
 * dossier et génère la pièce Qualiopi « évaluation initiale ». C'est un acte
 * pédagogique, au même titre que la notation d'un test — on lui applique donc la
 * même liste de rôles que /api/tests/notation, au lieu du simple `requireUser`.
 *
 * (Il n'existe pas de « propriétaire » d'un dossier dans ce CRM : c'est un
 * back-office d'équipe, tous les dossiers sont visibles de tous. La garde porte
 * donc sur le métier de la personne, pas sur un lien avec le dossier.)
 */
const ROLES_PEDAGOGIE = ["direction", "manager", "formatrice", "back_office"] as const;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireRole(req, ROLES_PEDAGOGIE); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  const r = await rattacherTestAuDossier(params.id, u.email ?? null);
  if (echecRattachement(r)) {
    // 409 et non 500 : « pas de test à rattacher » est un cas normal, pas une panne.
    return NextResponse.json({ ok: false, erreur: r.raison }, { status: 409 });
  }
  return NextResponse.json(r);
}
