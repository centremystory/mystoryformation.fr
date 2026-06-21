/**
 * MYSTORY — PATCH /api/emargement/duree
 * Ajuste la durée RÉELLE (heures_realisees) d'une séance déjà émargée.
 * Le créneau standard (3h) reste le défaut ; ici on saisit la durée réelle (ex. 4h ou 1h).
 * Garde-fous : séance émargée uniquement, 0 < h ≤ 12, on ne touche jamais emarge_le (anti-antidate).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const u = await requireRole(req, ["direction", "manager", "formatrice", "back_office"]);
    const b = await req.json().catch(() => ({}));
    const id = String(b?.planning_id ?? b?.id ?? "").trim();
    const heures = Number(b?.heures);
    if (!id) return NextResponse.json({ ok: false, erreur: "planning_id requis." }, { status: 400 });
    if (!Number.isFinite(heures) || heures <= 0 || heures > 12)
      return NextResponse.json({ ok: false, erreur: "Durée invalide (0 < h ≤ 12)." }, { status: 400 });

    const { data: seance } = await supabaseAdmin
      .from("planning").select("id, dossier_id, emarge_le, heures_realisees").eq("id", id).maybeSingle();
    if (!seance) return NextResponse.json({ ok: false, erreur: "Séance introuvable." }, { status: 404 });
    if (!(seance as any).emarge_le)
      return NextResponse.json({ ok: false, erreur: "La séance doit d'abord être émargée (deux signatures)." }, { status: 409 });

    const { error } = await supabaseAdmin
      .from("planning").update({ heures_realisees: heures }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

    await journal("dossier", (seance as any).dossier_id, "emargement_duree_ajustee",
      { planning_id: id, heures }, u.email ?? null);
    return NextResponse.json({ ok: true, planning_id: id, heures_realisees: heures });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Action non autorisée pour ce rôle." }, { status: 403 });
    throw e;
  }
}
