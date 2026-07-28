/**
 * MYSTORY — Fil de messages d'équipe (annonces internes).
 *  GET  : liste les messages actifs (épinglés d'abord, puis récents).
 *  POST { contenu } : publie un message pour toute l'équipe.
 *  PATCH { id, action: "epingler" | "desepingler" | "archiver" } : l'auteur ou la Direction.
 * Distinct de /interne (questions internes Q&A) et de /messages (prospects du site).
 * Petit effectif : tout le monde voit tout (pas de cloisonnement).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { estDirection } from "@/lib/roles";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function auteurDe(u: { id: string; nom?: string; email?: string; role?: string }) {
  const nom = (u.nom && u.nom.trim()) || (u.email ? u.email.split("@")[0] : "") || "Équipe";
  return { auteur_id: u.id, auteur_nom: nom, auteur_email: u.email ?? null, auteur_role: u.role ?? null };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const { data, error } = await supabaseAdmin
      .from("messages_equipe")
      .select("id, auteur_id, auteur_email, auteur_nom, auteur_role, contenu, epingle, cree_le")
      .eq("actif", true)
      .order("epingle", { ascending: false })
      .order("cree_le", { ascending: false })
      .limit(300);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, messages: data ?? [] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
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
  const contenu = String(b?.contenu ?? "").trim();
  if (!contenu) return NextResponse.json({ ok: false, erreur: "Message vide." }, { status: 400 });
  if (contenu.length > 4000) return NextResponse.json({ ok: false, erreur: "Message trop long (4000 caractères max)." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("messages_equipe")
    .insert({ ...auteurDe(u), contenu })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("messages_equipe", (data as any).id, "message_equipe_publie", { longueur: contenu.length }, u.email ?? null);
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
  const action = String(b?.action ?? "");
  if (!id || !["epingler", "desepingler", "archiver"].includes(action)) {
    return NextResponse.json({ ok: false, erreur: "id et action (epingler|desepingler|archiver) requis." }, { status: 400 });
  }

  // Épingler/archiver : l'auteur du message OU la Direction.
  const { data: msg } = await supabaseAdmin.from("messages_equipe").select("auteur_id, auteur_email").eq("id", id).maybeSingle();
  if (!msg) return NextResponse.json({ ok: false, erreur: "Message introuvable." }, { status: 404 });
  const m = msg as any;
  const estAuteur = (m.auteur_id && m.auteur_id === u.id) || (m.auteur_email && u.email && m.auteur_email === u.email);
  if (!estAuteur && !estDirection(u.roles ?? u.role)) {
    return NextResponse.json({ ok: false, erreur: "Action réservée à l'auteur ou à la Direction." }, { status: 403 });
  }

  const patch = action === "archiver" ? { actif: false } : { epingle: action === "epingler" };
  const { error } = await supabaseAdmin.from("messages_equipe").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("messages_equipe", id, `message_equipe_${action}`, {}, u.email ?? null);
  return NextResponse.json({ ok: true });
}
