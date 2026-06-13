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
    // Rappel automatique : BPF N-1 dû tant que non déposé et avant le 30 avril.
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const now = new Date();
    const y = now.getFullYear();
    const nm1 = y - 1;
    const avant30avril = now <= new Date(y, 3, 30, 23, 59, 59);
    const { data: depNm1 } = await supabaseAdmin.from("bpf_depots").select("annee").eq("annee", nm1).maybeSingle();
    const rappel = (avant30avril && !depNm1)
      ? { du: true, annee: nm1, message: `BPF ${nm1} à déposer avant le 30 avril ${y} sur monactiviteformation.emploi.gouv.fr` }
      : null;
    return NextResponse.json({ ok: true, synthese, rappel });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
