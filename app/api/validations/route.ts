/**
 * MYSTORY — /api/validations  (Validation Direction, point 26)
 * GET  ?statut=  : Direction/staff voient toute la file ; un autre rôle voit SES demandes.
 * PATCH { id, action: "approuver"|"refuser", commentaire? } : Direction/staff seulement.
 *        approuver → exécute réellement l'action puis marque approuvée+appliquée ;
 *        si l'exécution échoue, la demande reste en_attente (rien n'est appliqué à moitié).
 * Protégé par le middleware global (session équipe ou Bearer). Pas de suppression.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { estDirection } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { appliquerValidation, type TypeValidation } from "@/lib/validations";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const tout = estDirection(g.role);
  const statut = req.nextUrl.searchParams.get("statut");

  let q = supabaseAdmin
    .from("validations_direction")
    .select("id, type, libelle, statut, demande_par, demande_le, decide_par, decide_le, commentaire, applique, resultat")
    .order("demande_le", { ascending: false })
    .limit(200);
  if (statut) q = q.eq("statut", statut);
  if (!tout) q = q.eq("demande_par", g.email ?? "___sans_email___");

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, peutValider: tout, demandes: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!estDirection(g.role))
    return NextResponse.json({ ok: false, erreur: "Validation réservée à la Direction." }, { status: 403 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  const commentaire = body?.commentaire ? String(body.commentaire).slice(0, 500) : null;
  const approbateur = g.email ?? null;
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  if (action !== "approuver" && action !== "refuser")
    return NextResponse.json({ ok: false, erreur: "action : approuver ou refuser." }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from("validations_direction").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, erreur: "Demande introuvable." }, { status: 404 });
  if ((row as any).statut !== "en_attente")
    return NextResponse.json({ ok: false, erreur: "Demande déjà traitée." }, { status: 409 });

  if (action === "refuser") {
    const { error } = await supabaseAdmin.from("validations_direction")
      .update({ statut: "refuse", decide_par: approbateur, decide_le: new Date().toISOString(), commentaire })
      .eq("id", id).eq("statut", "en_attente");
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("validation", id, "validation_refusee",
      { type: (row as any).type, libelle: (row as any).libelle }, approbateur);
    return NextResponse.json({ ok: true, statut: "refuse" });
  }

  // approuver → exécuter l'action AVANT de marquer approuvée.
  let resultat: Record<string, unknown>;
  try {
    resultat = await appliquerValidation(
      { id, type: (row as any).type as TypeValidation, payload: (row as any).payload, demande_par: (row as any).demande_par },
      approbateur,
    );
  } catch (e: any) {
    // Exécution impossible : on NE marque PAS approuvée. Reste en_attente.
    return NextResponse.json({ ok: false, erreur: e?.message ?? String(e) }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("validations_direction")
    .update({ statut: "approuve", decide_par: approbateur, decide_le: new Date().toISOString(), commentaire, applique: true, resultat })
    .eq("id", id).eq("statut", "en_attente");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("validation", id, "validation_approuvee",
    { type: (row as any).type, libelle: (row as any).libelle, resultat }, approbateur);
  return NextResponse.json({ ok: true, statut: "approuve", resultat });
}
