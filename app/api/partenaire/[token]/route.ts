/**
 * MYSTORY — GET /api/partenaire/[token] : données du portail partenaire (scopées par jeton).
 * Le jeton (capability, gen_random_uuid) tient lieu d'authentification ; aucune donnée d'un autre partenaire n'est exposée.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolverPartenaire, assemblerPortail } from "@/lib/partenaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const p = await resolverPartenaire(params.token);
  if (!p) return NextResponse.json({ ok: false, erreur: "Lien invalide ou expiré." }, { status: 404 });
  const data = await assemblerPortail(p);
  return NextResponse.json({ ok: true, ...data });
}
