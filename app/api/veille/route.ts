/**
 * MYSTORY — /api/veille  (registre de veille — Qualiopi 23→26)
 * GET   ?categorie=  → entrées actives (filtrables), plus récentes d'abord.
 * POST  { categorie, titre, source?, lien?, resume?, impact?, date_veille? } → ajoute.
 * PATCH { id, action:"archiver" }  OU  { id, ...champs } → archive (actif=false) ou met à jour.
 * Pas de suppression (traçabilité). Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["legale_reglementaire", "emploi_metiers", "pedagogie_techno", "handicap"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const categorie = req.nextUrl.searchParams.get("categorie");
  let q = supabaseAdmin
    .from("veille")
    .select("id, categorie, titre, source, lien, resume, impact, date_veille, auteur, cree_le")
    .eq("actif", true)
    .order("date_veille", { ascending: false })
    .order("cree_le", { ascending: false });
  if (categorie && CATEGORIES.includes(categorie)) q = q.eq("categorie", categorie);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entrees: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const categorie = String(b?.categorie ?? "").trim();
  const titre = String(b?.titre ?? "").trim();
  if (!CATEGORIES.includes(categorie)) return NextResponse.json({ ok: false, erreur: "Catégorie invalide." }, { status: 400 });
  if (!titre) return NextResponse.json({ ok: false, erreur: "Titre requis." }, { status: 400 });

  const ligne: Record<string, unknown> = {
    categorie, titre,
    source: String(b?.source ?? "").trim() || null,
    lien: String(b?.lien ?? "").trim() || null,
    resume: String(b?.resume ?? "").trim() || null,
    impact: String(b?.impact ?? "").trim() || null,
    auteur: u.email ?? null,
  };
  const dateVeille = String(b?.date_veille ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateVeille)) ligne.date_veille = dateVeille;

  const { data, error } = await supabaseAdmin.from("veille").insert(ligne).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("veille", (data as any).id, "veille_ajoutee", { categorie, titre }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (String(b?.action ?? "") === "archiver") {
    const { error } = await supabaseAdmin.from("veille").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("veille", id, "veille_archivee", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  // Édition des champs fournis
  const champs: Record<string, unknown> = {};
  for (const k of ["titre", "source", "lien", "resume", "impact"]) {
    if (typeof b?.[k] === "string") champs[k] = String(b[k]).trim() || null;
  }
  if (typeof b?.categorie === "string" && CATEGORIES.includes(b.categorie)) champs.categorie = b.categorie;
  const dateVeille = String(b?.date_veille ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateVeille)) champs.date_veille = dateVeille;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("veille").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("veille", id, "veille_modifiee", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
