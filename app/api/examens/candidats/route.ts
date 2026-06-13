// app/api/examens/candidats/route.ts — Liste unifiée des candidats d'examen (lecture seule)
// Source : vue public.v_candidats_examen (historique import + ventes vivantes).
// Protégé par le middleware global. Données personnelles → service_role uniquement.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("v_candidats_examen")
    .select(
      "id, source, nom, prenom, civilite, email, telephone, type_brut, type_norm, sous_type, date_examen, horaire, agence, statut_paiement, numero_attestation, numero_facture, vendu_par, montant, a_confirmer, date_inscription, attestation_nom, attestation_depose_le"
    )
    .order("date_examen", { ascending: false, nullsFirst: false })
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, candidats: data ?? [] });
}
