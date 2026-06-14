/**
 * MYSTORY — /api/programmes/modules  (modules d'un programme — séquençage)
 * POST  { programmeId, titre, objectif?, dureeHeures?, compCo?, compCe?, compEo?, compEe?, ordre? } → ajoute.
 * PATCH { id, action:"archiver" } OU { id, ...champs } → archive / met à jour.
 * Pas de suppression. Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
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
  const programmeId = String(b?.programmeId ?? "").trim();
  const titre = String(b?.titre ?? "").trim();
  if (!programmeId) return NextResponse.json({ ok: false, erreur: "Programme requis." }, { status: 400 });
  if (!titre) return NextResponse.json({ ok: false, erreur: "Titre du module requis." }, { status: 400 });

  const { data: prog } = await supabaseAdmin.from("programmes").select("id").eq("id", programmeId).single();
  if (!prog) return NextResponse.json({ ok: false, erreur: "Programme introuvable." }, { status: 404 });

  const ligne = {
    programme_id: programmeId,
    ordre: Math.round(num(b?.ordre, 0)),
    titre,
    objectif: String(b?.objectif ?? "").trim() || null,
    duree_heures: num(b?.dureeHeures, 0),
    comp_co: !!b?.compCo, comp_ce: !!b?.compCe, comp_eo: !!b?.compEo, comp_ee: !!b?.compEe,
    auteur: u.email ?? null,
  };
  const { data, error } = await supabaseAdmin.from("programme_modules").insert(ligne).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("programme_modules", (data as any).id, "module_ajoute", { programmeId, titre }, u.email ?? null);
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
    const { error } = await supabaseAdmin.from("programme_modules").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("programme_modules", id, "module_archive", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = {};
  if (typeof b?.titre === "string" && b.titre.trim()) champs.titre = b.titre.trim();
  if (typeof b?.objectif === "string") champs.objectif = b.objectif.trim() || null;
  if (b?.dureeHeures !== undefined) champs.duree_heures = num(b.dureeHeures, 0);
  if (b?.ordre !== undefined) champs.ordre = Math.round(num(b.ordre, 0));
  for (const [k, col] of [["compCo", "comp_co"], ["compCe", "comp_ce"], ["compEo", "comp_eo"], ["compEe", "comp_ee"]] as const) {
    if (b?.[k] !== undefined) champs[col] = !!b[k];
  }
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("programme_modules").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("programme_modules", id, "module_modifie", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
