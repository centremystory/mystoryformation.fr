// app/api/documents/url/route.ts — Consulter le PDF archivé d'une pièce
// GET ?dossier=<uuid>&piece=<type> → URL signée 1 h vers la version archivée
// (la version signée est prioritaire sur la version générée).
// Lecture seule. Protégé par le middleware + requireUser (défense en profondeur).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSignedUrl } from "@/lib/crm";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  const dossier = req.nextUrl.searchParams.get("dossier")?.trim();
  const piece = req.nextUrl.searchParams.get("piece")?.trim();
  if (!dossier || !piece) {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : dossier et piece." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("archives")
    .select("variant, url")
    .eq("dossier_id", dossier)
    .eq("piece_type", piece);
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, erreur: "Aucun PDF archivé pour cette pièce." }, { status: 404 });
  }

  // La version signée fait foi quand elle existe
  const archive = data.find((a) => a.variant === "signe") ?? data.find((a) => a.variant === "genere") ?? data[0];
  try {
    const url = await getSignedUrl(archive.url, 3600);
    return NextResponse.json({ ok: true, url, variant: archive.variant });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? "Impossible de signer l'URL." }, { status: 500 });
  }
}
