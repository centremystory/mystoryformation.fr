// app/api/ventes-formation/route.ts — Liste opérationnelle des ventes de formation (Sheet importé).
// Source : table public.ventes_formation. Lecture seule. Filtrable par agence/statut/recherche côté page.
// Les MONTANTS sont réservés au propriétaire (verrou finance, cf. lib/roles) ; le reste = toute l'équipe.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { estProprietaire } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const voitMontants = estProprietaire(u.email);

  const lignes = await fetchAllRows<any>((from, to) => supabaseAdmin
    .from("ventes_formation")
    .select("id, date_inscription, agence_vente, formule_label, heures, montant_eur, nom, prenom, email, telephone, vendu_par, statut, fond_propre, commentaire, stagiaire_id")
    .eq("actif", true)
    .order("date_inscription", { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, to));

  const ventes = lignes.map((v: any) => ({
    id: v.id,
    date_inscription: v.date_inscription,
    agence: v.agence_vente,
    formule: v.formule_label,
    heures: v.heures,
    nom: `${v.prenom ?? ""} ${v.nom ?? ""}`.trim() || "(sans nom)",
    email: v.email,
    telephone: v.telephone,
    vendeur: v.vendu_par,
    statut: v.statut,
    fond_propre: v.fond_propre,
    commentaire: v.commentaire,
    href: v.stagiaire_id ? `/fiche/${v.stagiaire_id}` : null,
    montant: voitMontants ? v.montant_eur : null,
  }));

  return NextResponse.json({ ok: true, total: ventes.length, voitMontants, ventes });
}
