// app/api/dossiers/remarques/route.ts — Journal de suivi d'un dossier
// GET ?dossier=<uuid> : liste des remarques (plus récentes d'abord).
// POST { dossier_id, texte, auteur? } : ajout d'une remarque.
// PAS de PATCH ni DELETE : les remarques sont immuables (verrou aussi en base via trigger) —
// le journal de suivi est une preuve d'accompagnement, il doit être infalsifiable.
// Protégé par le middleware global (mot de passe d'équipe).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dossierId = req.nextUrl.searchParams.get("dossier")?.trim();
  if (!dossierId) {
    return NextResponse.json({ ok: false, erreur: "Paramètre requis : dossier (uuid)." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("remarques")
    .select("id, auteur, texte, horodatage")
    .eq("dossier_id", dossierId)
    .order("horodatage", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, remarques: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossier_id ?? "").trim();
  const texte = String(body?.texte ?? "").trim();
  const auteur = String(body?.auteur ?? "").trim() || null;

  if (!dossierId || !texte) {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : dossier_id et texte." }, { status: 400 });
  }
  if (texte.length > 2000) {
    return NextResponse.json({ ok: false, erreur: "Remarque trop longue (2 000 caractères max)." }, { status: 400 });
  }

  // Le dossier doit exister (jamais de remarque orpheline)
  const { data: dossier, error: dErr } = await supabaseAdmin
    .from("dossiers").select("id").eq("id", dossierId).single();
  if (dErr || !dossier) {
    return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("remarques")
    .insert({ dossier_id: dossierId, texte, auteur }) // horodatage posé par le trigger (serveur)
    .select("id, auteur, texte, horodatage")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, remarque: data });
}
