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
  examens: number;
  aConfirmer: number;
  impayes: number;
  nonInscritCci: number;
  montant: number | null;
};

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const voitMontants = estProprietaire(u.email);

  const [formations, examens] = await Promise.all([
    fetchAllRows<any>((f, t) => supabaseAdmin
      .from("ventes_formation").select("vendu_par, montant_eur").eq("actif", true).order("id").range(f, t)),
    fetchAllRows<any>((f, t) => supabaseAdmin
      .from("examens").select("vendu_par, montant_eur, reste_a_payer_eur, inscrit_cci, a_confirmer, statut_paiement")
      .eq("actif", true).order("id").range(f, t)),
  ]);

  const map = new Map<string, Ligne>();
  const ligne = (v: string): Ligne => {
    const k = norm(v);
    if (!map.has(k)) map.set(k, { vendeur: k, formations: 0, examens: 0, aConfirmer: 0, impayes: 0, nonInscritCci: 0, montant: 0 });
    return map.get(k)!;
  };

  for (const f of formations) {
    const l = ligne(f.vendu_par);
    l.formations++;
    l.montant = (l.montant ?? 0) + num(f.montant_eur);
  }
  for (const e of examens) {
    const l = ligne(e.vendu_par);
    l.examens++;
    l.montant = (l.montant ?? 0) + num(e.montant_eur);
    if (e.a_confirmer) l.aConfirmer++;
    // Impayé : un reste à payer strictement positif (source fiable ; les imports soldés = 0).
    if (num(e.reste_a_payer_eur) > 0) l.impayes++;
    // Non inscrit CCI : examen non encore inscrit auprès de la CCI.
    if (e.inscrit_cci === false) l.nonInscritCci++;
  }

  const lignes = [...map.values()]
    .map((l) => ({ ...l, montant: voitMontants ? Math.round(l.montant ?? 0) : null }))
    .sort((a, b) => b.formations + b.examens - (a.formations + a.examens));

  const totaux = {
    vendeurs: lignes.length,
    formations: formations.length,
    examens: examens.length,
    aConfirmer: lignes.reduce((s, l) => s + l.aConfirmer, 0),
    impayes: lignes.reduce((s, l) => s + l.impayes, 0),
    nonInscritCci: lignes.reduce((s, l) => s + l.nonInscritCci, 0),
    montant: voitMontants ? lignes.reduce((s, l) => s + (l.montant ?? 0), 0) : null,
  };

  return NextResponse.json({ ok: true, voitMontants, totaux, lignes });
}
