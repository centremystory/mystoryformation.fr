// app/api/classement/route.ts
// Classement vendeurs (examens) — cache pré-calculé par n8n (quotidien 19h)
// GET  : renvoie le dernier classement pour la page /classement
// POST : upsert du classement (appelé par le workflow n8n « Classement vendeurs AUTO »)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["direction"]);

    const { data, error } = await supabaseAdmin
      .from("classement_cache")
      .select("cle, periode_debut, periode_fin, payload, maj_le")
      .eq("cle", "examens")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({
        ok: true,
        classement: null,
        message:
          "Aucun classement en cache pour le moment — il sera calculé au prochain passage du robot (tous les jours à 19h).",
      });
    }
    return NextResponse.json({ ok: true, classement: data });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non autorisé" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["direction"]);

    const corps = await req.json().catch(() => null);
    if (!corps || corps.cle !== "examens" || !corps.payload || !corps.periode_debut || !corps.periode_fin) {
      return NextResponse.json(
        { ok: false, erreur: "Corps invalide : { cle: 'examens', periode_debut, periode_fin, payload } attendus." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("classement_cache").upsert(
      {
        cle: "examens",
        periode_debut: corps.periode_debut,
        periode_fin: corps.periode_fin,
        payload: corps.payload,
        maj_le: new Date().toISOString(),
      },
      { onConflict: "cle" }
    );

    if (error) {
      return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    }

    await journal("classement_cache", "examens", "classement_mis_a_jour", {
      periode: `${corps.periode_debut} → ${corps.periode_fin}`,
      total_centre: corps.payload?.total_centre ?? null,
    }, "n8n-classement");

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non autorisé" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
