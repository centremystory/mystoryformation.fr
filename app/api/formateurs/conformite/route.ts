/**
 * MYSTORY — /api/formateurs/conformite (2b)
 * GET → alertes de conformité avant séance :
 *   · fleManquant  : formatrices à venir sans justificatif FLE ;
 *   · docsManquant : formateurs sous-traitants (séance à venir) charte/contrat non signés.
 * Réservé à l'équipe (requireUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { conformiteFormateurs } from "@/lib/conformiteFormateurs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const r = await conformiteFormateurs();
  return NextResponse.json({ ok: true, ...r });
}
