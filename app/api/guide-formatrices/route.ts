/**
 * MYSTORY — /api/guide-formatrices  (guide pédagogique interne, éditable)
 * GET   ?categorie=  → fiches actives, triées par catégorie + ordre.
 * POST  { categorie, titre, contenu } → ajoute une fiche (Direction/Manager).
 * PATCH { id, action:"archiver" }  OU  { id, titre?, contenu?, categorie? } → archive / met à jour.
 * Jamais de suppression (actif=false). Journalisé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["accueil", "animation", "evaluation", "emargement", "conformite", "autre"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const categorie = req.nextUrl.searchParams.get("categorie");
  let q = supabaseAdmin.from("guide_formatrices")
    .select("id, slug, categorie, titre, contenu, ordre").eq("actif", true)
    .order("categorie", { ascending: true }).order("ordre", { ascending: true });
  if (categorie) q = q.eq("categorie", categorie);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fiches: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction." }, { status: 403 });
    throw e;
  }
  const b = await req.json().catch(() => ({}));
  const categorie = CATEGORIES.includes(String(b?.categorie)) ? String(b.categorie) : "autre";
  const titre = String(b?.titre ?? "").trim();
  const contenu = String(b?.contenu ?? "").trim();
  if (!titre || !contenu) return NextResponse.json({ ok: false, erreur: "Titre et contenu requis." }, { status: 400 });

  const { data: max } = await supabaseAdmin.from("guide_formatrices")
    .select("ordre").eq("categorie", categorie).order("ordre", { ascending: false }).limit(1).maybeSingle();
  const ordre = ((max as any)?.ordre ?? 0) + 1;
  const slug = `gf-${Date.now()}`;

  const { data, error } = await supabaseAdmin.from("guide_formatrices")
    .insert({ slug, categorie, titre, contenu, ordre, auteur: u.email ?? null })
    .select("id, slug, categorie, titre, contenu, ordre").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("guide_formatrice", (data as any).id, "creee", { titre }, u.email ?? null);
  return NextResponse.json({ ok: true, fiche: data });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction." }, { status: 403 });
    throw e;
  }
  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (b?.action === "archiver") {
    const { error } = await supabaseAdmin.from("guide_formatrices").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("guide_formatrice", id, "archivee", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const maj: Record<string, unknown> = { maj_le: new Date().toISOString() };
  if (typeof b?.titre === "string") maj.titre = b.titre.trim();
  if (typeof b?.contenu === "string") maj.contenu = b.contenu.trim();
  if (CATEGORIES.includes(String(b?.categorie))) maj.categorie = String(b.categorie);
  const { error } = await supabaseAdmin.from("guide_formatrices").update(maj).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("guide_formatrice", id, "modifiee", {}, u.email ?? null);
  return NextResponse.json({ ok: true });
}
