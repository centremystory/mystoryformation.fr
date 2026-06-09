import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QCM_SOURCE =
  "https://svepgknbbonrtwyvzaar.supabase.co/functions/v1/qcm";

export async function GET() {
  try {
    const r = await fetch(QCM_SOURCE, { cache: "no-store" });
    const html = await r.text();
    return new NextResponse(html, {
      status: r.ok ? 200 : 502,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("QCM momentanément indisponible. Réessayez.", {
      status: 502,
    });
  }
}
