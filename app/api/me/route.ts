/**
 * MYSTORY — GET /api/me : identité minimale de l'utilisateur courant (pour filtrer la NavBar).
 * Renvoie le rôle et son libellé. Session "staff" (équipe) → rôle "staff" (accès complet, transition).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { ROLE_LABEL, estProprietaire, type Role } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await verifySession(req);
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const roles = (u.roles && u.roles.length > 0 ? u.roles : (u.role ? [u.role] : []));
  const role = roles[0] ?? null;
  const role_label = role && role !== "staff" ? (ROLE_LABEL[role as Role] ?? role) : null;
  const roles_labels = roles.filter((r) => r !== "staff").map((r) => ROLE_LABEL[r as Role] ?? r);
  // 09/10/2026 — `proprietaire` est rendu ici pour que les écrans puissent FAIRE
  // DISPARAÎTRE ce qui est réservé au propriétaire (export de la base) au lieu de
  // laisser un bouton qui finit en 403 brut dans le navigateur. L'adresse de
  // référence est une variable d'environnement SERVEUR : la page ne peut pas la
  // comparer elle-même, c'est donc au serveur de répondre par oui ou non.
  return NextResponse.json({
    ok: true,
    user: { email: u.email ?? null, role, role_label, roles, roles_labels, proprietaire: estProprietaire(u.email) },
  });
}
