/**
 * MYSTORY — /api/programmes  (séquençage : programmes types réutilisables)
 * GET   ?certification=&niveau=  → programmes actifs + leurs modules actifs (triés par ordre).
 * POST  { certification, niveau, titre, description? }  → crée un programme.
 * PATCH { id, action:"archiver" } OU { id, ...champs }  → archive / met à jour.
 * Pas de suppression. Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CERTIFS = ["tef_irn", "leveltel", "transverse"];
const NIVEAUX = ["tous", "A1", "A2", "B1", "B2", "C1", "C2"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  let q = supabaseAdmin
    .from("programmes")
    .select("id, certification, niveau, titre, description, auteur, cree_le, programme_modules(id, ordre, titre, objectif, duree_heures, comp_co, comp_ce, comp_eo, comp_ee, actif)")
    .eq("actif", true)
    .order("cree_le", { ascending: false });
  const c = sp.get("certification"); if (c && CERTIFS.includes(c)) q = q.eq("certification", c);
  const n = sp.get("niveau"); if (n && NIVEAUX.includes(n)) q = q.eq("niveau", n);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const programmes = (data ?? []).map((p: any) => ({
    ...p,
    modules: (p.programme_modules ?? [])
      .filter((m: any) => m.actif)
      .sort((a: any, b: any) => (a.ordre - b.ordre) || 0),
    programme_modules: undefined,
  }));
  return NextResponse.json({ ok: true, programmes });
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
  const certification = String(b?.certification ?? "tef_irn").trim();
  const niveau = String(b?.niveau ?? "tous").trim();
  const titre = String(b?.titre ?? "").trim();
  const description = String(b?.description ?? "").trim() || null;
  if (!CERTIFS.includes(certification)) return NextResponse.json({ ok: false, erreur: "Certification invalide." }, { status: 400 });
  if (!NIVEAUX.includes(niveau)) return NextResponse.json({ ok: false, erreur: "Niveau invalide." }, { status: 400 });
  if (!titre) return NextResponse.json({ ok: false, erreur: "Titre requis." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("programmes")
    .insert({ certification, niveau, titre, description, auteur: u.email ?? null }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("programmes", (data as any).id, "programme_cree", { certification, niveau, titre }, u.email ?? null);
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
    const { error } = await supabaseAdmin.from("programmes").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("programmes", id, "programme_archive", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = {};
  if (typeof b?.titre === "string" && b.titre.trim()) champs.titre = b.titre.trim();
  if (typeof b?.description === "string") champs.description = b.description.trim() || null;
  if (typeof b?.certification === "string" && CERTIFS.includes(b.certification)) champs.certification = b.certification;
  if (typeof b?.niveau === "string" && NIVEAUX.includes(b.niveau)) champs.niveau = b.niveau;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("programmes").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("programmes", id, "programme_modifie", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
