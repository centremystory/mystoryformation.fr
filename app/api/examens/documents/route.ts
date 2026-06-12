/**
 * MYSTORY — GET /api/examens/documents?vente=<uuid>&piece=attestation|convocation
 * Renvoie une URL signée (1 h) du PDF archivé dans le bucket privé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getSignedUrl } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  const vente = req.nextUrl.searchParams.get("vente")?.trim();
  const piece = req.nextUrl.searchParams.get("piece")?.trim();
  if (!vente || (piece !== "attestation" && piece !== "convocation")) {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : vente et piece (attestation | convocation)." }, { status: 400 });
  }
  try {
    const url = await getSignedUrl(`examens/${vente}/${piece}_genere.pdf`, 3600);
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ ok: false, erreur: "Document introuvable — à (re)générer." }, { status: 404 });
  }
}
