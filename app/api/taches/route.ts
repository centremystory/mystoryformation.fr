// app/api/taches/route.ts — Tâches opérationnelles par agence (Gagny / Sarcelles / Rosny)
// GET (?agence=) liste les tâches actives · POST ajoute · PATCH {action: fait|repris|archive}.
// Pas de DELETE : on archive (actif=false). Protégé par le middleware global.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const AGENCES = ["Gagny", "Sarcelles", "Rosny"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const agence = String(url.searchParams.get("agence") ?? "").trim();
  let q = supabaseAdmin
    .from("taches")
    .select("id, agence, titre, echeance, fait, fait_le, cree_le")
    .eq("actif", true)
    .order("fait", { ascending: true })
    .order("echeance", { ascending: true, nullsFirst: false })
    .order("cree_le", { ascending: true });
  if (agence && AGENCES.includes(agence)) q = q.eq("agence", agence);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, taches: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const agence = String(body?.agence ?? "").trim();
  const titre = String(body?.titre ?? "").trim();
  const echeance = body?.echeance ? String(body.echeance).trim() : null;
  if (!AGENCES.includes(agence)) {
    return NextResponse.json({ ok: false, erreur: "Agence invalide (Gagny / Sarcelles / Rosny)." }, { status: 400 });
  }
  if (!titre) {
    return NextResponse.json({ ok: false, erreur: "Intitulé de la tâche obligatoire." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("taches")
    .insert({ agence, titre, echeance })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tache: data });
}

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  let patch: Record<string, any>;
  if (action === "fait") patch = { fait: true, fait_le: new Date().toISOString() };
  else if (action === "repris") patch = { fait: false, fait_le: null };
  else if (action === "archive") patch = { actif: false };
  else return NextResponse.json({ ok: false, erreur: "action : fait | repris | archive." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("taches").update(patch).eq("id", id).select().maybeSingle();
  if (error || !data) {
    return NextResponse.json({ ok: false, erreur: error?.message ?? "Tâche introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tache: data });
}
