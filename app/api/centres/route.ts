/**
 * MYSTORY — /api/centres  (référentiel des centres — page /centres)
 * GET    : liste des centres (lecture équipe).
 * POST   : ajouter un centre (Direction / Manager).
 * PATCH  : modifier un centre (Direction / Manager).
 * DELETE : supprimer un centre (Direction / Manager).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, requireRole, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_ADMIN = ["direction", "manager"] as const;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  const { data, error } = await supabaseAdmin
    .from("centres")
    .select("code, nom, adresse, acces, accueille_formation, accueille_examen, actif, ordre")
    .order("ordre").order("nom");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, centres: data ?? [] });
}

function parseBody(body: any) {
  return {
    code: String(body?.code ?? "").trim().toUpperCase(),
    nom: String(body?.nom ?? "").trim(),
    adresse: String(body?.adresse ?? "").trim(),
    acces: body?.acces == null ? null : (String(body.acces).trim() || null),
    accueille_formation: body?.accueille_formation === true,
    accueille_examen: body?.accueille_examen === true,
    actif: body?.actif !== false,
    ordre: body?.ordre == null ? 0 : Number(body.ordre),
  };
}

export async function POST(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const c = parseBody(body);
  if (!c.code || !c.nom || !c.adresse) return NextResponse.json({ ok: false, erreur: "Code, nom et adresse requis." }, { status: 422 });
  const { error } = await supabaseAdmin.from("centres").insert(c);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const c = parseBody(body);
  if (!c.code) return NextResponse.json({ ok: false, erreur: "code requis." }, { status: 400 });
  if (!c.nom || !c.adresse) return NextResponse.json({ ok: false, erreur: "Nom et adresse requis." }, { status: 422 });
  const { code, ...maj } = c;
  const { error } = await supabaseAdmin.from("centres").update(maj).eq("code", code);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, erreur: "code requis." }, { status: 400 });
  const { error } = await supabaseAdmin.from("centres").delete().eq("code", code);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
