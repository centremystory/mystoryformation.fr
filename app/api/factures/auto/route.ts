/**
 * MYSTORY — /api/factures/auto  (facturation automatique des dossiers de formation, point 27)
 * GET  — liste À BLANC les dossiers qui seraient facturés (contrôle n8n, aucun effet).
 * POST — émet + envoie les factures dues, puis renvoie le détail. Idempotent jour après jour
 *        (un dossier déjà facturé n'est plus « dû »). Sans DELETE.
 * Règles portées par lib/factures.facturationAutoDue :
 *        CPF → seulement après service fait validé (verrou L.6323-12) ; non-CPF → exclu si
 *        une remise hors CPF est en attente de validation Direction (point 26).
 * Protégé par le middleware global (session équipe ou Bearer JWT n8n/cron).
 * Restriction : émettre = action « facturation » (Direction + Secrétariat ; cron sans rôle passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peutAgir } from "@/lib/roles";
import { facturationAutoDue, facturerDossier, envoyerFacture } from "@/lib/factures";
import { journal } from "@/lib/examens";

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
  const dus = await facturationAutoDue();
  return NextResponse.json({ ok: true, total: dus.length, dus });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutAgir(g.role, "facturation")) {
    return NextResponse.json({ ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." }, { status: 403 });
  }
  const auteur = "facturation-auto";
  const dus = await facturationAutoDue();

  const resultats: Array<Record<string, unknown>> = [];
  for (const d of dus) {
    try {
      const f = await facturerDossier(d.dossierId, auteur);
      const envoi = await envoyerFacture(f.id, "emission", auteur);
      resultats.push({
        dossierId: d.dossierId, numero: f.numero, montant: f.montant, client: f.client,
        dejaExistante: f.dejaExistante, envoye: envoi.ok, erreur: envoi.ok ? undefined : envoi.erreur,
      });
    } catch (e: any) {
      resultats.push({ dossierId: d.dossierId, erreur: e?.message ?? String(e) });
    }
  }

  const emises = resultats.filter((r) => r.numero && !r.dejaExistante).length;
  const envoyees = resultats.filter((r) => r.envoye).length;
  await journal("factures", null, "facturation_auto",
    { candidats: dus.length, emises, envoyees }, auteur);

  return NextResponse.json({ ok: true, total: dus.length, emises, envoyees, resultats });
}
