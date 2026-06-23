// app/api/reclamations/route.ts — Réclamations candidats (examen) & stagiaires (formation).
// GET (?type=&statut=&agence=) liste les réclamations actives · POST crée · PATCH {action: statut|archive}.
// Pas de DELETE : on archive (actif=false). Horodatages serveur (trigger). Protégé par le middleware global.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TYPES = ["examen", "formation"];
const STATUTS = ["ouverte", "en_cours", "resolue"];
const PRIORITES = ["basse", "normale", "haute"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = String(url.searchParams.get("type") ?? "").trim();
  const statut = String(url.searchParams.get("statut") ?? "").trim();
  const agence = String(url.searchParams.get("agence") ?? "").trim();

  let q = supabaseAdmin
    .from("reclamations")
    .select("id, type, candidat_nom, candidat_prenom, candidat_email, candidat_telephone, vente_id, dossier_id, objet, detail, statut, priorite, agence, cree_par, cree_le, maj_le, resolu_le, resolu_par")
    .eq("actif", true)
    .order("statut", { ascending: true })   // 'en_cours' < 'ouverte' < 'resolue' (alpha) — réordonné côté UI
    .order("cree_le", { ascending: false });
  if (TYPES.includes(type)) q = q.eq("type", type);
  if (STATUTS.includes(statut)) q = q.eq("statut", statut);
  if (agence) q = q.eq("agence", agence);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reclamations: data ?? [] });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const type = String(body?.type ?? "").trim();
  const objet = String(body?.objet ?? "").trim();
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide (examen / formation)." }, { status: 400 });
  if (!objet) return NextResponse.json({ ok: false, erreur: "Objet de la réclamation obligatoire." }, { status: 400 });

  const priorite = PRIORITES.includes(String(body?.priorite ?? "")) ? String(body.priorite) : "normale";
  const u = await verifySession(req);

  const insert = {
    type,
    objet,
    detail: body?.detail ? String(body.detail).trim() : null,
    candidat_nom: body?.candidat_nom ? String(body.candidat_nom).trim() : null,
    candidat_prenom: body?.candidat_prenom ? String(body.candidat_prenom).trim() : null,
    candidat_email: body?.candidat_email ? String(body.candidat_email).trim() : null,
    candidat_telephone: body?.candidat_telephone ? String(body.candidat_telephone).trim() : null,
    vente_id: body?.vente_id ? String(body.vente_id).trim() : null,
    dossier_id: body?.dossier_id ? String(body.dossier_id).trim() : null,
    priorite,
    agence: body?.agence ? String(body.agence).trim() : null,
    cree_par: u?.email ?? null,
  };

  const { data, error } = await supabaseAdmin.from("reclamations").insert(insert).select().single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reclamation: data });
}

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const u = await verifySession(req);
  let patch: Record<string, any>;
  if (action === "statut") {
    const statut = String(body?.statut ?? "").trim();
    if (!STATUTS.includes(statut)) return NextResponse.json({ ok: false, erreur: "statut : ouverte | en_cours | resolue." }, { status: 400 });
    // resolu_le est posé par le trigger ; on renseigne juste qui a résolu.
    patch = statut === "resolue" ? { statut, resolu_par: u?.email ?? null } : { statut };
  } else if (action === "archive") {
    patch = { actif: false };
  } else {
    return NextResponse.json({ ok: false, erreur: "action : statut | archive." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("reclamations").update(patch).eq("id", id).select().maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, erreur: error?.message ?? "Réclamation introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true, reclamation: data });
}
