// app/api/factures/pdf/route.ts — Consulter le PDF d'une facture (ou attestation de paiement).
// GET ?id=<factureId> → régénère et renvoie le PDF en inline (ouverture dans le navigateur).
// Lecture seule. Réservé (comme le reste du module factures) aux rôles ayant la permission
// « facturation » (Direction / Secrétariat) — défense en profondeur en plus du middleware.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { pdfFacture } from "@/lib/factures";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}
// Tokens de service (n8n/cron, sans rôle) et session équipe passent ; un rôle individuel non autorisé est bloqué.
function peutFacturer(u: SessionUser): boolean {
  return !u.role || peut(u.roles ?? u.role, "facturation");
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutFacturer(g)) {
    return NextResponse.json({ ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." }, { status: 403 });
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
