// app/api/cockpit-commercial/route.ts — Cockpit commercial par vendeur.
// Agrège ventes_formation + examens (Sheets importés) par vendu_par : volumes + items à relancer
// (à confirmer / impayés / non inscrits CCI). MONTANTS réservés au propriétaire (verrou finance).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { estProprietaire } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const norm = (v: any) => String(v ?? "").trim() || "(non attribué)";
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

type Ligne = {
  vendeur: string;
  formations: number;
  examens: number;      // TEF IRN + examen civique
  autres: number;       // plateformes / autres ventes
  aConfirmer: number;
  impayes: number;
  nonInscritCci: number;
  montant: number | null;
};

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const voitMontants = estProprietaire(u.email);

  // Filtre de période (facultatif) sur la date d'inscription : ?debut=YYYY-MM-DD&fin=YYYY-MM-DD.
  const sp = req.nextUrl.searchParams;
  const debut = sp.get("debut"); const fin = sp.get("fin");
  const dOk = debut && RE_DATE.test(debut) ? debut : null;
  const fOk = fin && RE_DATE.test(fin) ? fin : null;
  const bornes = (q: any) => { let x = q; if (dOk) x = x.gte("date_inscription", dOk); if (fOk) x = x.lte("date_inscription", fOk); return x; };

  const [formations, examens] = await Promise.all([
    fetchAllRows<any>((f, t) => bornes(supabaseAdmin
      .from("ventes_formation").select("vendu_par, montant_eur, statut, date_inscription").eq("actif", true)).order("id").range(f, t)),
    fetchAllRows<any>((f, t) => bornes(supabaseAdmin
      .from("examens").select("vendu_par, montant_eur, reste_a_payer_eur, inscrit_cci, a_confirmer, statut_paiement, type_examen, date_inscription")
      .eq("actif", true)).order("id").range(f, t)),
  ]);

  const map = new Map<string, Ligne>();
  const ligne = (v: string): Ligne => {
    const k = norm(v);
    if (!map.has(k)) map.set(k, { vendeur: k, formations: 0, examens: 0, autres: 0, aConfirmer: 0, impayes: 0, nonInscritCci: 0, montant: 0 });
    return map.get(k)!;
  };

  for (const f of formations) {
    const l = ligne(f.vendu_par);
    l.formations++;
    l.montant = (l.montant ?? 0) + num(f.montant_eur);
  }
  for (const e of examens) {
    const l = ligne(e.vendu_par);
    // Plateformes / autres ventes vs vrais examens (TEF IRN / civique).
    if (/plateforme|plateform|vente_plateforme|autre/i.test(String(e.type_examen ?? ""))) l.autres++;
    else l.examens++;
    l.montant = (l.montant ?? 0) + num(e.montant_eur);
    if (e.a_confirmer) l.aConfirmer++;
    // Impayé : un reste à payer strictement positif (source fiable ; les imports soldés = 0).
    const impaye = num(e.reste_a_payer_eur) > 0 || /(acompte|attente|partiel|impay|à payer)/i.test(String(e.statut_paiement ?? ""));
    if (impaye) l.impayes++;
    // Non inscrit CCI : on n'inscrit à la CCI QUE quand c'est payé en entier (règle métier).
    if (e.inscrit_cci === false && !impaye) l.nonInscritCci++;
  }

  const lignes = [...map.values()]
    .map((l) => ({ ...l, montant: voitMontants ? Math.round(l.montant ?? 0) : null }))
    .sort((a, b) => (b.formations + b.examens + b.autres) - (a.formations + a.examens + a.autres));

  // Formations à relancer = argent dû (statut « à payer » / « reste à payer »).
  const formationsARelancer = formations.filter((f: any) => /payer/i.test(String(f.statut ?? ""))).length;

  const totaux = {
    vendeurs: lignes.length,
    formations: formations.length,
    formationsARelancer,
    examens: lignes.reduce((s, l) => s + l.examens, 0),
    autres: lignes.reduce((s, l) => s + l.autres, 0),
    aConfirmer: lignes.reduce((s, l) => s + l.aConfirmer, 0),
    impayes: lignes.reduce((s, l) => s + l.impayes, 0),
    nonInscritCci: lignes.reduce((s, l) => s + l.nonInscritCci, 0),
    montant: voitMontants ? lignes.reduce((s, l) => s + (l.montant ?? 0), 0) : null,
  };

  return NextResponse.json({ ok: true, voitMontants, totaux, lignes });
}
