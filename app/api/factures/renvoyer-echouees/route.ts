/**
 * MYSTORY — /api/factures/renvoyer-echouees
 * GET  — liste les factures dont l'email d'émission n'a jamais abouti (contrôle).
 * POST — renvoie ces factures (email d'émission). Exclut CPF (payeur CDC), payées, sans email.
 *        Idempotent : dès qu'un envoi réussit, email_envoye_le est posé → sort de la liste.
 * Appelé quotidiennement par le cron tick. Middleware : session équipe ou Bearer JWT cron.
 * Restriction : action « facturation » (Direction + Secrétariat ; cron sans rôle passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peutAgir } from "@/lib/roles";
import { facturesEmailEchoue, envoyerFacture } from "@/lib/factures";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const ids = await facturesEmailEchoue();
  return NextResponse.json({ ok: true, a_renvoyer: ids.length });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutAgir(g.roles ?? g.role, "facturation")) {
    return NextResponse.json({ ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." }, { status: 403 });
  }
  const ids = await facturesEmailEchoue();
  let envoyees = 0;
  const echecs: string[] = [];
  for (const id of ids) {
    const envoi = await envoyerFacture(id, "emission", "renvoi-auto");
    if (envoi.ok) envoyees++; else echecs.push(id);
  }
  return NextResponse.json({ ok: true, total: ids.length, envoyees, echecs: echecs.length });
}
