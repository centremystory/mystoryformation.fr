/**
 * MYSTORY — GET /api/bpf?annee=YYYY  (synthèse BPF, auth obligatoire)
 * Année N-1 par défaut.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { bpfSynthese } from "@/lib/bpf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const a = Number(req.nextUrl.searchParams.get("annee"));
  const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : new Date().getFullYear() - 1;
  try {
    const synthese = await bpfSynthese(annee);
    return NextResponse.json({ ok: true, synthese });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
