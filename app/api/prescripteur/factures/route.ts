/**
 * MYSTORY — Les factures d'un organisme partenaire, vues depuis son espace.
 *
 * 10/09/2026 — le partenaire ne voyait pas ce qu'on lui facturait : il appelait
 * pour savoir s'il restait quelque chose à régler, ou payait deux fois. Il voit
 * désormais ses factures, leur montant, et si elles sont réglées ou non.
 *
 * Lecture seule, et strictement les siennes : le filtre porte sur son identifiant
 * de session, jamais sur un paramètre reçu.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sessionPrescripteur } from "@/lib/prescripteurAuth";
import { resolverPrescripteurParId } from "@/lib/prescripteur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await sessionPrescripteur(req);
  if (!s) return NextResponse.json({ ok: false, erreur: "Session expirée." }, { status: 401 });
  const p = await resolverPrescripteurParId(s.id);
  if (!p) return NextResponse.json({ ok: false, erreur: "Compte introuvable." }, { status: 404 });

  // Les factures de ce partenaire : on les retrouve par les demandes qui y sont
  // rattachees, ce qui evite de se fier au libelle « client » (un texte libre).
  const { data: liens } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("facture_id")
    .eq("partenaire_id", p.id)
    .not("facture_id", "is", null);

  const ids = [...new Set((liens ?? []).map((l: any) => l.facture_id))];
  if (!ids.length) return NextResponse.json({ ok: true, factures: [] });

  const { data, error } = await supabaseAdmin
    .from("factures")
    .select("id, numero, montant, designation, statut, date_emission, date_paiement, mode_reglement")
    .in("id", ids)
    .order("date_emission", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Combien de candidats derriere chaque facture : le partenaire rapproche ainsi
  // le montant de ce qu'il a reellement inscrit.
  const { data: parFacture } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("facture_id, candidat_nom, candidat_prenom")
    .eq("partenaire_id", p.id)
    .in("facture_id", ids);

  const detail = new Map<string, string[]>();
  for (const d of parFacture ?? []) {
    const l = detail.get((d as any).facture_id) ?? [];
    l.push(`${(d as any).candidat_prenom} ${(d as any).candidat_nom}`);
    detail.set((d as any).facture_id, l);
  }

  const factures = (data ?? []).map((f: any) => {
    const noms = detail.get(f.id) ?? [];
    return {
      id: f.id,
      numero: f.numero,
      montant: Number(f.montant ?? 0),
      designation: f.designation,
      // « payée » est le seul etat qui compte pour lui ; le reste est « à régler ».
      reglee: f.statut === "payée" || f.date_paiement != null,
      statut: f.statut,
      date_emission: f.date_emission,
      date_paiement: f.date_paiement,
      mode_reglement: f.mode_reglement,
      candidats: noms.sort(),
      nb_candidats: noms.length,
    };
  });

  const du = factures.filter((f) => !f.reglee).reduce((t, f) => t + f.montant, 0);
  return NextResponse.json({ ok: true, factures, reste_a_regler: du });
}
