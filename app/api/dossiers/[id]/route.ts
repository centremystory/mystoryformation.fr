// app/api/dossiers/[id]/route.ts — Actions sur un dossier de formation.
// DELETE = archivage RÉVERSIBLE (statut='archive') : le dossier disparaît des listes actives
// sans rien supprimer (aucune ligne liée touchée → pas de bug FK). Réservé Direction/Manager. Journalisé.
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction / aux managers." }, { status: 403 });
    throw e;
  }
  const { data: d } = await supabaseAdmin.from("dossiers").select("id, statut").eq("id", params.id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const { error } = await supabaseAdmin.from("dossiers").update({ statut: "archive" }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("dossier", params.id, "dossier_archive", { de: d.statut ?? null }, u.email ?? null);
  return NextResponse.json({ ok: true });
}

// PATCH { statut: "..." } — réactiver un dossier archivé (remettre un statut actif). Direction/Manager.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireRole(req, ["direction", "manager"]); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction / aux managers." }, { status: 403 });
    throw e;
  }
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const statut = typeof b?.statut === "string" ? b.statut.slice(0, 30) : "incomplet";
  const { error } = await supabaseAdmin.from("dossiers").update({ statut }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("dossier", params.id, "dossier_reactive", { vers: statut }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
