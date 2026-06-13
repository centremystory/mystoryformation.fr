/**
 * MYSTORY — GET /api/bpf/export?annee=YYYY&format=csv|pdf  (auth)
 * Exporte le BPF de l'année : CSV (données) ou PDF (calé sur le Cerfa, aide au remplissage).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { bpfSynthese } from "@/lib/bpf";
import { bpfCsv, bpfHtml } from "@/lib/bpf-export";
import { renderPdf } from "@/lib/renderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const a = Number(req.nextUrl.searchParams.get("annee"));
  const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : new Date().getFullYear() - 1;
  const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase();

  try {
    const synthese = await bpfSynthese(annee);
    if (format === "pdf") {
      const pdf = await renderPdf(bpfHtml(synthese));
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="BPF_${annee}_MYSTORY_preparation.pdf"`,
        },
      });
    }
    const csv = bpfCsv(synthese);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="BPF_${annee}_MYSTORY.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
