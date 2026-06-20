// app/api/dossiers/route.ts — Liste de suivi des dossiers (équipe)
// Lecture seule : dossiers + stagiaire + formatrice + état des pièces.
// Protégé par le middleware global (mot de passe d'équipe).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);
  // Jointure interne sur stagiaires seulement quand on filtre par site (sinon on garde tous les dossiers).
  const jointureStagiaire = site ? "stagiaires!inner ( nom, prenom, agence )" : "stagiaires ( nom, prenom, agence )";
  let q = supabaseAdmin
    .from("dossiers")
    .select(
      `id, certif, financement, statut, statut_tunnel, date_debut, date_fin, token, created_at,
       heures_prevues, service_fait_valide, formatrice_libre, satisfaction_froid_envoyee_le,
       ${jointureStagiaire},
       formatrices ( nom, prenom ),
       pieces ( type, statut, optionnelle, exige_signature, ordre, sign_url_integre )`
    )
    .order("created_at", { ascending: false });
  if (site) q = q.eq("stagiaires.agence", site);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dossiers: data ?? [], site });
}
