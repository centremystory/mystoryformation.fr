/**
 * MYSTORY — /api/examens/liste-attente (CDC §4 — liste d'attente si session complète)
 * GET   → entrées en attente, groupables par session (embed session).
 * POST  { sessionId, nom, prenom?, email?, telephone?, note? } → ajoute en liste d'attente.
 * PATCH { id, action: place_proposee|convertie|retirer } → fait avancer / retire.
 * Pas de delete (retiree via statut). Tout journalisé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const session = req.nextUrl.searchParams.get("session");
  let q = supabaseAdmin
    .from("liste_attente_examen")
    .select("*, sessions_examen:session_id (type, date_examen, horaire)")
    .neq("statut", "retiree")
    .order("cree_le", { ascending: true });
  if (session) q = q.eq("session_id", session);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entrees: data ?? [] });
}

export async function POST(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const sessionId = String(b?.sessionId ?? "").trim();
  const nom = String(b?.nom ?? "").trim();
  if (!sessionId || !nom) return NextResponse.json({ ok: false, erreur: "Session et nom requis." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("liste_attente_examen").insert({
    session_id: sessionId, nom, prenom: b?.prenom || null, email: b?.email || null,
    telephone: b?.telephone || null, note: b?.note || null, created_by: u.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("liste_attente_examen", (data as any).id, "liste_attente_ajout", { session_id: sessionId, nom }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}

export async function PATCH(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  const action = String(b?.action ?? "");
  const map: Record<string, string> = { place_proposee: "place_proposee", convertie: "convertie", retirer: "retiree" };
  if (!id || !map[action]) return NextResponse.json({ ok: false, erreur: "id + action (place_proposee|convertie|retirer) requis." }, { status: 400 });
  const { error } = await supabaseAdmin.from("liste_attente_examen").update({ statut: map[action] }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("liste_attente_examen", id, `liste_attente_${action}`, {}, u.email ?? null);
  return NextResponse.json({ ok: true });
}
