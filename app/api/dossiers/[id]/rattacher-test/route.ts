/**
 * MYSTORY — POST /api/dossiers/[id]/rattacher-test
 *
 * Rattache au dossier le test de positionnement que la personne a déjà passé sur
 * test.mystoryformation.fr, inscrit son niveau d'entrée et génère la pièce Qualiopi.
 *
 * GET : dit ce qui se passerait, sans rien écrire — pour afficher un bouton
 * « rattacher son test » seulement quand il y a effectivement un test à rattacher.
 *
 * Ne crée JAMAIS de dossier : la qualification d'un prospect reste humaine.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { rattacherTestAuDossier, echecRattachement } from "@/lib/rattacherTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireUser(req); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  const r = await rattacherTestAuDossier(params.id, u.email ?? null);
  if (echecRattachement(r)) {
    // 409 et non 500 : « pas de test à rattacher » est un cas normal, pas une panne.
    return NextResponse.json({ ok: false, erreur: r.raison }, { status: 409 });
  }
  return NextResponse.json(r);
}
