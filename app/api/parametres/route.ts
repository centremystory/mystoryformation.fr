/**
 * MYSTORY — /api/parametres  (réglages éditables — page /reglages)
 * GET   : liste des paramètres (lecture équipe).
 * PATCH : modifier la valeur d'un paramètre (Direction / Manager). Vide le cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, requireRole, UnauthorizedError } from "@/lib/auth";
import { viderCacheParametres } from "@/lib/parametres";
import { journal } from "@/lib/examens";

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
    .from("parametres")
    .select("cle, valeur, type, categorie, libelle, aide, ordre, updated_at, updated_by")
    .order("categorie").order("ordre").order("cle");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, parametres: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const cle = String(body?.cle ?? "").trim();
  if (!cle) return NextResponse.json({ ok: false, erreur: "cle requise." }, { status: 400 });
  const valeur = String(body?.valeur ?? "").trim();

  // Vérifie le type déclaré (un paramètre 'number' doit rester numérique).
  const { data: p } = await supabaseAdmin.from("parametres").select("type").eq("cle", cle).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, erreur: "Paramètre inconnu." }, { status: 404 });
  if (p.type === "number" && !Number.isFinite(Number(valeur))) {
    return NextResponse.json({ ok: false, erreur: "Ce paramètre doit être un nombre." }, { status: 422 });
  }

  const { error } = await supabaseAdmin
    .from("parametres")
    .update({ valeur, updated_at: new Date().toISOString(), updated_by: u.email ?? null })
    .eq("cle", cle);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  viderCacheParametres();
  try { await journal("parametre", null, "parametre_maj", { cle, valeur }, u.email ?? null); } catch { /* trace best-effort */ }
  return NextResponse.json({ ok: true });
}
