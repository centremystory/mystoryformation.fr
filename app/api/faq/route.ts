/**
 * MYSTORY — /api/faq  (FAQ interne équipe — réponses homogènes aux prospects)
 * GET   ?categorie=  → entrées actives (filtrables).
 * POST  { categorie, question, reponse } → ajoute.
 * PATCH { id, action:"archiver" }  OU  { id, question?, reponse?, categorie? } → archive / met à jour.
 * Pas de suppression (archive via actif=false). Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["financement_cpf", "tef_irn", "leveltel", "inscription", "examen", "tarifs", "autre"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const categorie = req.nextUrl.searchParams.get("categorie");
  let q = supabaseAdmin
    .from("faq")
    .select("id, categorie, question, reponse, auteur, cree_le, maj_le")
    .eq("actif", true)
    .order("categorie", { ascending: true })
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

  const categorie = String(b?.categorie ?? "autre").trim();
  const question = String(b?.question ?? "").trim();
  const reponse = String(b?.reponse ?? "").trim();
  if (!CATEGORIES.includes(categorie)) return NextResponse.json({ ok: false, erreur: "Catégorie invalide." }, { status: 400 });
  if (!question) return NextResponse.json({ ok: false, erreur: "Question requise." }, { status: 400 });
  if (!reponse) return NextResponse.json({ ok: false, erreur: "Réponse requise." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("faq").insert({ categorie, question, reponse, auteur: u.email ?? null }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("faq", (data as any).id, "faq_ajoutee", { categorie, question }, u.email ?? null);
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
    const { error } = await supabaseAdmin.from("faq").update({ actif: false, maj_le: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("faq", id, "faq_archivee", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = { maj_le: new Date().toISOString() };
  if (typeof b?.question === "string" && b.question.trim()) champs.question = b.question.trim();
  if (typeof b?.reponse === "string" && b.reponse.trim()) champs.reponse = b.reponse.trim();
  if (typeof b?.categorie === "string" && CATEGORIES.includes(b.categorie)) champs.categorie = b.categorie;
  if (Object.keys(champs).length === 1) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("faq").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("faq", id, "faq_modifiee", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
