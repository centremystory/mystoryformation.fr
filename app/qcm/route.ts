/**
 * MYSTORY — GET /qcm  : sert le QCM candidat depuis le fichier versionné du repo.
 * (Remplace l'ancien proxy vers le bucket Storage : le QCM est désormais dans le code.)
 */
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: string | null = null;

export async function GET() {
  try {
    if (!cache) cache = readFileSync(join(process.cwd(), "app/qcm/qcm.html"), "utf8");
    return new NextResponse(cache, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new NextResponse("QCM momentanément indisponible. Réessayez.", { status: 500 });
  }
}
