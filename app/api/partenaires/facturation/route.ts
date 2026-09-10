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
import { journal } from "@/lib/examens";

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
function tarif(p: any, typeSession: string): number {
  const civique = String(typeSession ?? "").toLowerCase().includes("civique");
  const t = civique ? p.tarif_civique : p.tarif_tef_irn;
  return Number(t ?? 0);
}

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
      tarif: tarif(p, s.type),
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

  const { data: p } = await supabaseAdmin
    .from("partenaires")
    .select("id, raison_sociale, tarif_tef_irn, tarif_civique, serie_facture")
    .eq("id", partenaireId).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, erreur: "Partenaire introuvable." }, { status: 404 });
  if (!p.serie_facture) {
    return NextResponse.json(
      { ok: false, erreur: "Ce partenaire n'a pas de série de facturation." }, { status: 400 });
  }

  const { data: s } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, type, date_examen, horaire, centre")
    .eq("id", sessionId).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, erreur: "Session introuvable." }, { status: 404 });

  // Les places de CE partenaire sur CETTE session, pas encore facturees.
  const { data: lignes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, candidat_nom, candidat_prenom")
    .eq("partenaire_id", partenaireId).eq("session_id", sessionId)
    .is("facture_id", null).in("statut", ["confirmee", "en_attente"]);

  if (!lignes?.length) {
    return NextResponse.json(
      { ok: false, erreur: "Rien à facturer : aucune place non facturée sur cette session." },
      { status: 409 });
  }

  const pu = tarif(p, s.type);
  if (pu <= 0) {
    return NextResponse.json(
      { ok: false, erreur: "Aucun tarif partenaire n'est défini pour ce type d'examen." },
      { status: 400 });
  }
  const montant = lignes.length * pu;

  // Numero atomique. Si la serie n'a pas de compteur, la fonction leve — on le dit
  // clairement plutot que de laisser remonter une erreur Postgres brute.
  const { data: num, error: eNum } = await supabaseAdmin
    .rpc("prochain_numero_facture", { p_serie: p.serie_facture });
  if (eNum || !num) {
    return NextResponse.json(
      { ok: false, erreur: `Numérotation impossible pour la série « ${p.serie_facture} » : `
                         + `${eNum?.message ?? "aucun compteur"}.` }, { status: 500 });
  }

  const libelle = String(s.type).toLowerCase().includes("civique") ? "Examen civique" : "TEF IRN";
  const [an, mo, jo] = String(s.date_examen).slice(0, 10).split("-");
  const designation =
    `${lignes.length} passation${lignes.length > 1 ? "s" : ""} ${libelle} — session du `
    + `${jo}/${mo}/${an}${s.horaire ? ` (${s.horaire})` : ""}`
    + `${s.centre ? ` — ${s.centre}` : ""} — ${pu.toLocaleString("fr-FR")} € par candidat`;

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      numero: num, serie: p.serie_facture, type: "facture",
      client: p.raison_sociale, montant, designation, statut: "émise",
    })
    .select("id, numero, montant, date_emission").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Rattachement : c'est ce lien qui empeche de refacturer les memes places, et qui
  // permet au partenaire de voir ses factures depuis son espace.
  const { error: eLien } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .update({ facture_id: facture.id })
    .in("id", lignes.map((l: any) => l.id));
  if (eLien) {
    // La facture existe mais n'est rattachee a rien : on le signale plutot que de
    // laisser croire que c'est fait, sinon les memes places seront refacturees.
    return NextResponse.json(
      { ok: false, erreur: `Facture ${num} créée, mais le rattachement des candidats a échoué : `
                         + `${eLien.message}. À reprendre à la main avant toute nouvelle émission.` },
      { status: 500 });
  }

  await journal("facture", facture.id, "emission_partenaire",
    { partenaire: p.raison_sociale, numero: num, montant, places: lignes.length,
      session: `${s.date_examen} ${s.horaire}` }, u.email ?? null);

  return NextResponse.json({ ok: true, facture: { ...facture, places: lignes.length } });
}
