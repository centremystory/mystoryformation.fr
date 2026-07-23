/**
 * MYSTORY — /api/examens/sessions
 * GET    → planning (capacité / inscrits / restantes via v_sessions_examen), sessions à venir
 * POST   → création unitaire { type, date_examen, horaire, capacite?, note? }
 *          ou en PLAGE { plage: true, type, du, au, capacite?, note? } selon les créneaux types :
 *          TEF IRN : lundis et vendredis, 9h30-12h30 et 14h-17h · civique : lundi→vendredi, 17h30-18h30
 *          (les sessions déjà existantes sont ignorées — idempotent)
 * PATCH  → { id, capacite?, note? } — modification journalisée (capacite_modifiee)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const dynamic = "force-dynamic";

const HORAIRES_TYPES: Record<string, { jours: number[]; horaires: string[] }> = {
  TEF_IRN: { jours: [1, 5], horaires: ["9h30-12h30", "14h-17h"] },          // lundi, vendredi
  Examen_civique: { jours: [1, 2, 3, 4, 5], horaires: ["17h30-18h30"] },    // lundi → vendredi
};

async function garde(req: NextRequest) {
  try { await requireUser(req); return null; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  const depuis = req.nextUrl.searchParams.get("depuis")
    ?? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const { data, error } = await supabaseAdmin
    .from("v_sessions_examen").select("*")
    .gte("date_examen", depuis)
    .order("date_examen").order("horaire");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const type = String(body?.type ?? "");
  if (!HORAIRES_TYPES[type]) return NextResponse.json({ ok: false, erreur: "type requis : TEF_IRN | Examen_civique." }, { status: 400 });
  const capacite = Number.isInteger(body?.capacite) && body.capacite >= 0 ? body.capacite : 12;
  const note = String(body?.note ?? "").trim() || null;
  const auteur = String(body?.auteur ?? "").trim() || null;
  const centre = (String(body?.centre ?? "GAGNY").trim().toUpperCase() || "GAGNY");

  const lignes: Array<{ type: string; date_examen: string; horaire: string; capacite: number; note: string | null; centre: string }> = [];

  if (body?.plage) {
    const du = String(body?.du ?? ""), au = String(body?.au ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au) || du > au) {
      return NextResponse.json({ ok: false, erreur: "Plage invalide : du / au (AAAA-MM-JJ, du ≤ au)." }, { status: 400 });
    }
    const regles = HORAIRES_TYPES[type];
    const d = new Date(du + "T12:00:00Z");
    const fin = new Date(au + "T12:00:00Z");
    while (d <= fin) {
      const jour = d.getUTCDay(); // 0=dim … 6=sam
      if (regles.jours.includes(jour)) {
        const iso = d.toISOString().slice(0, 10);
        for (const h of regles.horaires) lignes.push({ type, date_examen: iso, horaire: h, capacite, note, centre });
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else {
    const date_examen = String(body?.date_examen ?? "");
    const horaire = String(body?.horaire ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_examen) || !horaire) {
      return NextResponse.json({ ok: false, erreur: "date_examen (AAAA-MM-JJ) et horaire requis." }, { status: 400 });
    }
    lignes.push({ type, date_examen, horaire, capacite, note, centre });
  }

  if (lignes.length === 0) return NextResponse.json({ ok: false, erreur: "Aucune session à créer sur cette plage." }, { status: 400 });

  // Idempotent : les créneaux déjà existants sont ignorés (contrainte unique type/date/horaire).
  const { data, error } = await supabaseAdmin
    .from("sessions_examen")
    .upsert(lignes, { onConflict: "type,date_examen,horaire,centre", ignoreDuplicates: true })
    .select("id");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const creees = data?.length ?? 0;
  await journal("sessions_examen", null, "sessions_creees", { type, demandees: lignes.length, creees, capacite }, auteur);
  return NextResponse.json({ ok: true, demandees: lignes.length, creees, ignorees: lignes.length - creees });
}

export async function PATCH(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const { data: avant } = await supabaseAdmin.from("sessions_examen").select("*").eq("id", id).maybeSingle();
  if (!avant) return NextResponse.json({ ok: false, erreur: "Session introuvable." }, { status: 404 });

  const maj: Record<string, unknown> = {};
  if (body.capacite !== undefined) {
    if (!Number.isInteger(body.capacite) || body.capacite < 0) {
      return NextResponse.json({ ok: false, erreur: "capacite : entier ≥ 0." }, { status: 400 });
    }
    maj.capacite = body.capacite;
  }
  if (body.note !== undefined) maj.note = String(body.note ?? "").trim() || null;
  if (Object.keys(maj).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à modifier." }, { status: 400 });

  const { error } = await supabaseAdmin.from("sessions_examen").update(maj).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await supabaseAdmin.from("journal").insert({
    entite: "sessions_examen", entite_id: id, evenement: "capacite_modifiee",
    ancienne_valeur: { capacite: (avant as any).capacite, note: (avant as any).note },
    nouvelle_valeur: maj, auteur: String(body?.auteur ?? "").trim() || null,
  });
  return NextResponse.json({ ok: true });
}
