// app/api/dossiers/route.ts — Liste de suivi des dossiers (équipe)
// Lecture seule : dossiers + stagiaire + formatrice + état des pièces.
// Protégé par le middleware global (mot de passe d'équipe).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select(
      `id, certif, financement, statut, date_debut, date_fin, token, created_at,
       heures_prevues, service_fait_valide,
       stagiaires ( nom, prenom ),
       formatrices ( nom, prenom ),
       pieces ( type, statut, optionnelle, exige_signature, ordre, sign_url_integre )`
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dossiers: data ?? [] });
}
