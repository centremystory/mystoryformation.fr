// app/api/factures/pdf/route.ts — Consulter le PDF d'une facture (ou attestation de paiement).
// GET ?id=<factureId> → régénère et renvoie le PDF en inline (ouverture dans le navigateur).
// Lecture seule. Protégé par le middleware + requireUser (défense en profondeur).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { pdfFacture } from "@/lib/factures";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  try {
    const res = await pdfFacture(id);
    if (!res) return NextResponse.json({ ok: false, erreur: "Facture introuvable." }, { status: 404 });
    return new NextResponse(new Uint8Array(res.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Facture_${res.numero}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? "Erreur de génération du PDF." }, { status: 500 });
  }
}
