/**
 * MYSTORY — /api/comptes  (gestion des comptes individuels, réservé Direction)
 * GET    → liste des utilisateurs (sans le hash)
 * POST   → créer { nom, prenom?, email, role, motDePasse }
 * PATCH  → { id, action: "role"|"actif"|"reset", role?|actif?|motDePasse? }
 * Pas de suppression (traçabilité) : on désactive via `actif`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ROLES, peut, type Role } from "@/lib/roles";
import { journal } from "@/lib/examens";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function gardeDirection(req: NextRequest) {
  const u = await requireUser(req); // lève UnauthorizedError si pas de session
  if (!peut(u.role, "comptes_gerer")) return { interdit: true as const, u };
  return { interdit: false as const, u };
}

export async function GET(req: NextRequest) {
  try {
    const g = await gardeDirection(req);
    if (g.interdit) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    const { data, error } = await supabaseAdmin
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, actif, doit_changer_mdp, cree_le, derniere_connexion")
      .order("actif", { ascending: false })
      .order("nom", { ascending: true });
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, utilisateurs: data ?? [] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await gardeDirection(req);
    if (g.interdit) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

    const b = await req.json().catch(() => ({}));
    const nom = String(b?.nom ?? "").trim();
    const prenom = String(b?.prenom ?? "").trim() || null;
    const email = String(b?.email ?? "").trim();
    const role = String(b?.role ?? "").trim() as Role;
    const motDePasse = String(b?.motDePasse ?? "");

    if (!nom) return NextResponse.json({ ok: false, erreur: "Nom requis." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, erreur: "Email invalide." }, { status: 400 });
    if (!ROLES.includes(role)) return NextResponse.json({ ok: false, erreur: "Rôle invalide." }, { status: 400 });
    if (motDePasse.length < 8) return NextResponse.json({ ok: false, erreur: "Mot de passe : 8 caractères minimum." }, { status: 400 });

    const hash = bcrypt.hashSync(motDePasse, 10);
    const { data, error } = await supabaseAdmin
      .from("utilisateurs")
      .insert({ nom, prenom, email, role, mot_de_passe_hash: hash, doit_changer_mdp: true })
      .select("id")
      .single();
    if (error) {
      if ((error as any).code === "23505") return NextResponse.json({ ok: false, erreur: "Un compte existe déjà avec cet email." }, { status: 409 });
      return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    }
    await journal("utilisateur", (data as any).id, "compte_cree", { email, role, par: g.u.email ?? g.u.id }, g.u.email ?? null);
    return NextResponse.json({ ok: true, id: (data as any).id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await gardeDirection(req);
    if (g.interdit) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

    const b = await req.json().catch(() => ({}));
    const id = String(b?.id ?? "").trim();
    const action = String(b?.action ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

    if (action === "role") {
      const role = String(b?.role ?? "").trim() as Role;
      if (!ROLES.includes(role)) return NextResponse.json({ ok: false, erreur: "Rôle invalide." }, { status: 400 });
      const { error } = await supabaseAdmin.from("utilisateurs").update({ role }).eq("id", id);
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
      await journal("utilisateur", id, "role_modifie", { role, par: g.u.email ?? g.u.id }, g.u.email ?? null);
      return NextResponse.json({ ok: true });
    }

    if (action === "actif") {
      const actif = b?.actif === true;
      const { error } = await supabaseAdmin.from("utilisateurs").update({ actif }).eq("id", id);
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
      await journal("utilisateur", id, actif ? "compte_reactive" : "compte_desactive", { par: g.u.email ?? g.u.id }, g.u.email ?? null);
      return NextResponse.json({ ok: true });
    }

    if (action === "reset") {
      const motDePasse = String(b?.motDePasse ?? "");
      if (motDePasse.length < 8) return NextResponse.json({ ok: false, erreur: "Mot de passe : 8 caractères minimum." }, { status: 400 });
      const hash = bcrypt.hashSync(motDePasse, 10);
      const { error } = await supabaseAdmin.from("utilisateurs").update({ mot_de_passe_hash: hash, doit_changer_mdp: true }).eq("id", id);
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
      await journal("utilisateur", id, "mot_de_passe_reinitialise", { par: g.u.email ?? g.u.id }, g.u.email ?? null);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}
