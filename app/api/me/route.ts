/**
 * MYSTORY — GET /api/me : identité minimale de l'utilisateur courant (pour filtrer la NavBar).
 * Renvoie le rôle et son libellé. Session "staff" (équipe) → rôle "staff" (accès complet, transition).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await verifySession(req);
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const role = u.role ?? null;
  const role_label = role && role !== "staff" ? (ROLE_LABEL[role as Role] ?? role) : null;
  return NextResponse.json({ ok: true, user: { email: u.email ?? null, role, role_label } });
}
