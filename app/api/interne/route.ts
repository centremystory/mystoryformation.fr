/**
 * MYSTORY — Fil de questions internes (équipe).
 *  GET   : liste les questions (parent_id null, non archivées) + leurs réponses.
 *  POST  { contenu, parent_id? } : pose une question (parent_id absent) ou répond (parent_id présent).
 *  PATCH { id, action: "resoudre" | "rouvrir" | "archiver" } : statut d'une question (jamais DELETE).
 * Auteur = identité du compte connecté (nom + rôle) ; "Équipe" si session par mot de passe d'équipe.
 * Tout le monde dans l'équipe voit tout (pas de cloisonnement) — petit effectif.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ligne = {
  id: string;
  parent_id: string | null;
  auteur_nom: string;
  auteur_role: string | null;
  contenu: string;
  statut: string;
  cree_le: string;
  resolu_le: string | null;
  resolu_par: string | null;
};

function auteurDe(u: { id: string; nom?: string; email?: string; role?: string }) {
  const nom = (u.nom && u.nom.trim()) || (u.email ? u.email.split("@")[0] : "") || "Équipe";
  return { auteur_id: u.id, auteur_nom: nom, auteur_email: u.email ?? null, auteur_role: u.role ?? null };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const { data, error } = await supabaseAdmin
      .from("questions_internes")
      .select("id, parent_id, auteur_nom, auteur_role, contenu, statut, cree_le, resolu_le, resolu_par")
      .eq("archive", false)
      .order("cree_le", { ascending: true });
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

    const lignes = (data ?? []) as Ligne[];
    const reponses = lignes.filter((l) => l.parent_id !== null);
    const fil = lignes
      .filter((l) => l.parent_id === null)
      .map((q) => ({ ...q, reponses: reponses.filter((r) => r.parent_id === q.id) }))
      // ouvertes d'abord, puis les plus récentes en tête
      .sort((a, b) => {
        if (a.statut !== b.statut) return a.statut === "ouverte" ? -1 : 1;
        return a.cree_le < b.cree_le ? 1 : -1;
      });
    return NextResponse.json({ ok: true, questions: fil });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    return NextResponse.json({ ok: false, erreur: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(() => ({} as { contenu?: string; parent_id?: string }));
    const contenu = typeof b?.contenu === "string" ? b.contenu.trim() : "";
    const parent_id = typeof b?.parent_id === "string" && b.parent_id ? b.parent_id : null;
    if (!contenu) return NextResponse.json({ ok: false, erreur: "Message vide." }, { status: 400 });
    if (contenu.length > 4000) return NextResponse.json({ ok: false, erreur: "Message trop long (4000 caractères max)." }, { status: 400 });

    // Si c'est une réponse : la question parente doit exister, être une racine et non archivée.
    if (parent_id) {
      const { data: parent } = await supabaseAdmin
        .from("questions_internes")
        .select("id, parent_id, archive")
        .eq("id", parent_id)
        .maybeSingle();
      if (!parent || parent.parent_id !== null || parent.archive) {
        return NextResponse.json({ ok: false, erreur: "Question introuvable." }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("questions_internes")
      .insert({ contenu, parent_id, ...auteurDe(u) })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    return NextResponse.json({ ok: false, erreur: "Erreur serveur." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(() => ({} as { id?: string; action?: string }));
    const id = typeof b?.id === "string" ? b.id : "";
    const action = typeof b?.action === "string" ? b.action : "";
    if (!id || !["resoudre", "rouvrir", "archiver"].includes(action)) {
      return NextResponse.json({ ok: false, erreur: "id + action valide requis." }, { status: 400 });
    }
    const maj =
      action === "resoudre"
        ? { statut: "resolue", resolu_le: new Date().toISOString(), resolu_par: auteurDe(u).auteur_nom }
        : action === "rouvrir"
        ? { statut: "ouverte", resolu_le: null, resolu_par: null }
        : { archive: true };
    const { error } = await supabaseAdmin.from("questions_internes").update(maj).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    return NextResponse.json({ ok: false, erreur: "Erreur serveur." }, { status: 500 });
  }
}
