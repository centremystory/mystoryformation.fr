/**
 * MYSTORY — GET /api/permissions/public : map effective des permissions de pages.
 * PUBLIC (rôle→pages, non sensible) : lue par le middleware Edge (qui n'a pas d'accès DB)
 * et par la nav. Cache court côté plateforme pour limiter la charge.
 */
import { NextResponse } from "next/server";
import { mapEffective } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const map = await mapEffective();
    return NextResponse.json({ ok: true, map }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch {
    // En cas d'erreur DB, renvoyer une map vide → le consommateur retombe sur les défauts code.
    return NextResponse.json({ ok: true, map: {} });
  }
}
