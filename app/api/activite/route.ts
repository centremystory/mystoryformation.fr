/**
 * MYSTORY — GET /api/activite?annee=YYYY  (tableau de bord ACTIVITÉ combiné)
 * Vue direction (propriétaire) : CA + volumes formations (ventes_formation) + examens
 * (examens), par centre, par mois, par type. Agrégats calculés en lecture paginée
 * (immunisé contre le plafond 1000). Séparé du BPF légal (formation-only).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireProprietaire, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const estAnnule = (s: unknown) => /annul/i.test(String(s ?? ""));

export async function GET(req: NextRequest) {
  try { await requireProprietaire(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la direction." }, { status: 403 });
    throw e;
  }

  // Période : plage [debut, fin] (YYYY-MM-DD) prioritaire ; sinon année pleine (repli historique).
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const qDebut = req.nextUrl.searchParams.get("debut");
  const qFin = req.nextUrl.searchParams.get("fin");
  const a = Number(req.nextUrl.searchParams.get("annee"));
  const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : new Date().getFullYear();

  const parPlage = isDate(qDebut) && isDate(qFin) && (qDebut as string) <= (qFin as string);
  const debut = parPlage ? (qDebut as string) : `${annee}-01-01`;
  const fin = parPlage ? (qFin as string) : `${annee}-12-31`;
  const d10 = (v: unknown) => String(v ?? "").slice(0, 10);
  const dansPlage = (v: unknown) => { const d = d10(v); return d >= debut && d <= fin; };
  // Granularité du graphe de tendance : jour si période ≤ 92 j, sinon mois.
  const spanJours = (Date.parse(fin) - Date.parse(debut)) / 86_400_000;
  const granularite: "jour" | "mois" = spanJours <= 92 ? "jour" : "mois";

  let forms: any[], exams: any[];
  try {
    forms = await fetchAllRows<any>((f, t) => supabaseAdmin
      .from("ventes_formation")
      .select("date_inscription, agence_vente, montant_eur, statut, formule_label")
      .order("id").range(f, t));
    exams = await fetchAllRows<any>((f, t) => supabaseAdmin
      .from("examens")
      .select("date_inscription, agence_vente, montant_eur, type_examen, statut_paiement, actif")
      .order("id").range(f, t));
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message || "Erreur de lecture." }, { status: 500 });
  }

  // Filtre plage + exclusion des annulés/remboursés.
  const fA = forms.filter((r) => dansPlage(r.date_inscription) && !estAnnule(r.statut));
  const eA = exams.filter((r) => dansPlage(r.date_inscription)
    && r.actif !== false && !["Annulé", "Remboursé"].includes(String(r.statut_paiement ?? "")));

  const caFormation = fA.reduce((s, r) => s + num(r.montant_eur), 0);
  const caExamen = eA.reduce((s, r) => s + num(r.montant_eur), 0);

  // Par centre (formation + examen).
  const centres = new Map<string, { formations: number; examens: number; caFormation: number; caExamen: number }>();
  const cAdd = (ag: unknown, kind: "f" | "e", montant: number) => {
    const key = String(ag ?? "").trim() || "(non renseigné)";
    const c = centres.get(key) ?? { formations: 0, examens: 0, caFormation: 0, caExamen: 0 };
    if (kind === "f") { c.formations++; c.caFormation += montant; } else { c.examens++; c.caExamen += montant; }
    centres.set(key, c);
  };
  fA.forEach((r) => cAdd(r.agence_vente, "f", num(r.montant_eur)));
  eA.forEach((r) => cAdd(r.agence_vente, "e", num(r.montant_eur)));

  // Tendance : bucket par jour (YYYY-MM-DD) ou par mois (YYYY-MM) selon la granularité.
  const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const buckets = new Map<string, { formations: number; examens: number; ca: number }>();
  const label = (cle: string) => granularite === "jour"
    ? `${cle.slice(8, 10)}/${cle.slice(5, 7)}`
    : `${MOIS_FR[Number(cle.slice(5, 7)) - 1] ?? cle} ${cle.slice(2, 4)}`;
  const bAdd = (date: unknown, kind: "f" | "e", montant: number) => {
    const cle = granularite === "jour" ? d10(date) : String(date ?? "").slice(0, 7);
    if (granularite === "jour" ? cle.length !== 10 : cle.length !== 7) return;
    const c = buckets.get(cle) ?? { formations: 0, examens: 0, ca: 0 };
    if (kind === "f") c.formations++; else c.examens++;
    c.ca += montant; buckets.set(cle, c);
  };
  fA.forEach((r) => bAdd(r.date_inscription, "f", num(r.montant_eur)));
  eA.forEach((r) => bAdd(r.date_inscription, "e", num(r.montant_eur)));

  // Par type d'examen.
  const typesExam = new Map<string, { nb: number; ca: number }>();
  eA.forEach((r) => { const t = String(r.type_examen ?? "").trim() || "Autre"; const c = typesExam.get(t) ?? { nb: 0, ca: 0 }; c.nb++; c.ca += num(r.montant_eur); typesExam.set(t, c); });

  // Top formules.
  const formules = new Map<string, { nb: number; ca: number }>();
  fA.forEach((r) => { const t = String(r.formule_label ?? "").trim() || "—"; const c = formules.get(t) ?? { nb: 0, ca: 0 }; c.nb++; c.ca += num(r.montant_eur); formules.set(t, c); });

  return NextResponse.json({
    ok: true,
    annee, debut, fin, granularite,
    total: {
      ca: Math.round(caFormation + caExamen),
      caFormation: Math.round(caFormation),
      caExamen: Math.round(caExamen),
      nbFormations: fA.length,
      nbExamens: eA.length,
      nbTotal: fA.length + eA.length,
    },
    parCentre: [...centres.entries()]
      .map(([centre, v]) => ({ centre, ...v, ca: Math.round(v.caFormation + v.caExamen), caFormation: Math.round(v.caFormation), caExamen: Math.round(v.caExamen) }))
      .sort((x, y) => y.ca - x.ca),
    parPeriode: [...buckets.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([cle, v]) => ({ cle, label: label(cle), formations: v.formations, examens: v.examens, ca: Math.round(v.ca) })),
    parTypeExamen: [...typesExam.entries()].map(([type, v]) => ({ type, nb: v.nb, ca: Math.round(v.ca) })).sort((x, y) => y.ca - x.ca),
    topFormules: [...formules.entries()].map(([formule, v]) => ({ formule, nb: v.nb, ca: Math.round(v.ca) })).sort((x, y) => y.nb - x.nb).slice(0, 8),
  });
}
