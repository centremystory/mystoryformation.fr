/**
 * MYSTORY — GET /api/inscriptions/catalogue : catalogue "live" pour le formulaire d'inscription.
 * Renvoie les noms/prix des formules depuis offres_formules (source éditable via /catalogue),
 * indexés par CodeFormule → le formulaire reflète les modifications faites dans /catalogue.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { catalogueLive } from "@/lib/catalogueLive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const catalogue = await catalogueLive();
  return NextResponse.json({ ok: true, catalogue });
}
