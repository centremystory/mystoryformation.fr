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
import { ROLES, ROLE_LABEL, peut, type Role } from "@/lib/roles";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = process.env.APP_URL ?? "https://mystoryformation.fr";

/** Email d'accès envoyé à la personne (création) ou de réinitialisation. Non bloquant. */
async function envoyerAcces(
  email: string, prenom: string | null, role: Role, motDePasse: string,
  type: "creation" | "reset", auteur?: string | null,
): Promise<boolean> {
  if (!EMAIL_ACTIF) return false;
  const reset = type === "reset";
  const corps = `
    <p>Bonjour ${prenom ?? ""},</p>
    <p>${reset ? "Le mot de passe de votre accès" : "Un accès"} à l'espace équipe <strong>MYSTORY</strong> a été ${reset ? "réinitialisé" : "créé pour vous"}.</p>
    <p>
      <strong>Connexion :</strong> <a href="${APP_URL}/connexion">${APP_URL}/connexion</a><br/>
      <strong>Identifiant :</strong> ${email}<br/>
      <strong>Mot de passe ${reset ? "" : "temporaire"} :</strong> ${motDePasse}<br/>
      <strong>Rôle :</strong> ${ROLE_LABEL[role]}
    </p>
    <p>Pour votre sécurité, merci de modifier ce mot de passe après votre prochaine connexion.</p>
  `;
  try {
    const r = await envoyerEmail({
      a: email,
      objet: reset ? "Votre mot de passe MYSTORY a été réinitialisé" : "Votre accès à l'espace MYSTORY",
      html: gabaritEmail(reset ? "Réinitialisation de votre accès" : "Bienvenue dans l'espace MYSTORY", corps),
      entite: "utilisateur",
      entiteId: email,
      auteur: auteur ?? null,
    });
    return !!r?.ok;
  } catch {
    return false;
  }
}

async function gardeDirection(req: NextRequest) {
  const u = await requireUser(req); // lève UnauthorizedError si pas de session
  if (!peut(u.roles ?? u.role, "comptes_gerer")) return { interdit: true as const, u };
  return { interdit: false as const, u };
}

export async function GET(req: NextRequest) {
  try {
    const g = await gardeDirection(req);
    if (g.interdit) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    const { data, error } = await supabaseAdmin
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, roles, actif, doit_changer_mdp, cree_le, derniere_connexion")
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
    const rolesIn: string[] = Array.isArray(b?.roles)
      ? Array.from(new Set(b.roles.map((r: any) => String(r).trim()).filter(Boolean)))
      : (role ? [role] : []);
    const motDePasse = String(b?.motDePasse ?? "");

    if (!nom) return NextResponse.json({ ok: false, erreur: "Nom requis." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, erreur: "Email invalide." }, { status: 400 });
    if (rolesIn.length === 0 || !rolesIn.every((r) => ROLES.includes(r as Role))) return NextResponse.json({ ok: false, erreur: "Au moins un rôle valide requis." }, { status: 400 });
    if (motDePasse.length < 8) return NextResponse.json({ ok: false, erreur: "Mot de passe : 8 caractères minimum." }, { status: 400 });

    const hash = bcrypt.hashSync(motDePasse, 10);
    const { data, error } = await supabaseAdmin
      .from("utilisateurs")
      .insert({ nom, prenom, email, role: rolesIn[0], roles: rolesIn, mot_de_passe_hash: hash, doit_changer_mdp: true })
      .select("id")
      .single();
    if (error) {
      if ((error as any).code === "23505") return NextResponse.json({ ok: false, erreur: "Un compte existe déjà avec cet email." }, { status: 409 });
      return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    }
    await journal("utilisateur", (data as any).id, "compte_cree", { email, roles: rolesIn, par: g.u.email ?? g.u.id }, g.u.email ?? null);
    const emailEnvoye = await envoyerAcces(email, prenom, rolesIn[0] as Role, motDePasse, "creation", g.u.email ?? null);
    return NextResponse.json({ ok: true, id: (data as any).id, emailEnvoye });
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
      const rolesIn: string[] = Array.isArray(b?.roles)
        ? Array.from(new Set(b.roles.map((r: any) => String(r).trim()).filter(Boolean)))
        : (role ? [role] : []);
      if (rolesIn.length === 0 || !rolesIn.every((r) => ROLES.includes(r as Role))) return NextResponse.json({ ok: false, erreur: "Au moins un rôle valide requis." }, { status: 400 });
      const { error } = await supabaseAdmin.from("utilisateurs").update({ role: rolesIn[0], roles: rolesIn }).eq("id", id);
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
      await journal("utilisateur", id, "role_modifie", { roles: rolesIn, par: g.u.email ?? g.u.id }, g.u.email ?? null);
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
      const { data: cible, error } = await supabaseAdmin
        .from("utilisateurs")
        .update({ mot_de_passe_hash: hash, doit_changer_mdp: true })
        .eq("id", id)
        .select("email, prenom, role")
        .single();
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
      await journal("utilisateur", id, "mot_de_passe_reinitialise", { par: g.u.email ?? g.u.id }, g.u.email ?? null);
      const emailEnvoye = cible
        ? await envoyerAcces((cible as any).email, (cible as any).prenom, (cible as any).role, motDePasse, "reset", g.u.email ?? null)
        : false;
      return NextResponse.json({ ok: true, emailEnvoye });
    }

    return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}
