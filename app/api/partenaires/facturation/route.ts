/**
 * MYSTORY — Facturation d'un organisme partenaire, session par session.
 *
 * L'article 7 de la convention fixe la règle : « Le Centre émet sa facture au plus
 * tard deux jours ouvrés après la session, pour l'ensemble des places consommées
 * ET DES PLACES DUES. » Une facture couvre donc UNE session et TOUS les candidats
 * que le partenaire y a placés — y compris les absents, dont la place reste due.
 *
 * GET  → ce qui reste à facturer, session par session.
 * POST → émet la facture d'une session.
 *
 * Le numéro vient de prochain_numero_facture(), une fonction Postgres qui
 * incrémente le compteur de façon atomique : deux clics simultanés ne peuvent pas
 * produire deux fois le même numéro, ce qu'aucun comptage côté application ne
 * garantit. Chaque partenaire a sa propre série (MYS-SECURE-2026-0001…), donc sa
 * propre suite continue.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facturerSession, tarifPartenaire, echecFacture } from "@/lib/facturationPartenaire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["direction", "manager", "back_office"] as const;

async function garde(req: NextRequest) {
  try { return { u: await requireRole(req, ROLES), code: 0 }; }
  catch (e) {
    if (e instanceof UnauthorizedError) return { u: null, code: 401 };
    if (e instanceof ForbiddenError) return { u: null, code: 403 };
    throw e;
  }
}
const refus = (code: number) =>
  NextResponse.json(
    { ok: false, erreur: code === 403 ? "Réservé à l'encadrement." : "Non authentifié." },
    { status: code });

/** Le tarif partenaire qui s'applique, selon le type d'examen de la session. */
// tarif() vit desormais dans lib/facturationPartenaire (tarifPartenaire).

export async function GET(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  // Les sessions passées ou du jour, qui portent des candidats non encore factures.
  const { data: demandes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, partenaire_id, statut, facture_id, candidat_nom, candidat_prenom, "
          + "session_id, sessions_examen:session_id (type, date_examen, horaire, centre), "
          + "partenaires:partenaire_id (raison_sociale, tarif_tef_irn, tarif_civique, serie_facture)")
    .is("facture_id", null)
    .in("statut", ["confirmee", "en_attente"])
    .limit(1000);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lots = new Map<string, any>();

  for (const d of demandes ?? []) {
    const s: any = Array.isArray((d as any).sessions_examen)
      ? (d as any).sessions_examen[0] : (d as any).sessions_examen;
    const p: any = Array.isArray((d as any).partenaires)
      ? (d as any).partenaires[0] : (d as any).partenaires;
    if (!s?.date_examen || !p) continue;
    // On ne facture pas une session qui n'a pas encore eu lieu.
    if (s.date_examen > aujourdhui) continue;

    const k = `${(d as any).partenaire_id}|${(d as any).session_id}`;
    const lot = lots.get(k) ?? {
      partenaire_id: (d as any).partenaire_id,
      partenaire: p.raison_sociale,
      serie: p.serie_facture,
      session_id: (d as any).session_id,
      type: s.type, date_examen: s.date_examen, horaire: s.horaire, centre: s.centre,
      tarif: tarifPartenaire(p, s.type),
      candidats: [] as string[],
    };
    lot.candidats.push(`${(d as any).candidat_prenom} ${(d as any).candidat_nom}`);
    lots.set(k, lot);
  }

  const aFacturer = [...lots.values()].map((l) => ({
    ...l,
    candidats: l.candidats.sort(),
    nb: l.candidats.length,
    montant: l.candidats.length * l.tarif,
  })).sort((a, b) => a.date_examen.localeCompare(b.date_examen));

  return NextResponse.json({ ok: true, a_facturer: aFacturer });
}

export async function POST(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  let b: any;
  try { b = await req.json(); } catch {
    return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 });
  }
  const partenaireId = String(b?.partenaire_id ?? "").trim();
  const sessionId = String(b?.session_id ?? "").trim();
  if (!partenaireId || !sessionId) {
    return NextResponse.json(
      { ok: false, erreur: "partenaire_id et session_id requis." }, { status: 400 });
  }

  // 15/09/2026 — la logique d'emission vit desormais dans lib/facturationPartenaire,
  // partagee avec le cron du jour d'examen (/api/cron/facturation-partenaire).
  // Deux implementations, ce sont deux series de numeros qui divergent un jour.
  const r = await facturerSession({ partenaireId, sessionId, auteur: u.email ?? null });
  if (echecFacture(r)) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: r.code });
  return NextResponse.json({ ok: true, facture: r.facture });
}
