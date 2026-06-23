// app/api/attestations-paiement/route.ts — Recherche candidat pour les commerciaux (appel entrant).
// GET ?q= : cherche dans v_candidats_examen (nom/prénom/téléphone/email/n° attestation/n° facture).
// Lecture seule, filtrée par site. Les actions (report, renvoi, réclamation) passent par leurs flux dédiés.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brut = String(url.searchParams.get("q") ?? "").trim();
  // Neutralise les caractères qui casseraient la syntaxe du filtre .or() de PostgREST.
  const q = brut.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, candidats: [] });

  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);
  let sel = supabaseAdmin
    .from("v_candidats_examen")
    .select(
      "id, source, nom, prenom, civilite, email, telephone, type_norm, sous_type, date_examen, horaire, agence, statut_paiement, reste_a_payer, numero_attestation, numero_facture, vendu_par, montant, session_id, attestation_nom, attestation_depose_le",
    )
    .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,telephone.ilike.%${q}%,email.ilike.%${q}%,numero_attestation.ilike.%${q}%,numero_facture.ilike.%${q}%`)
    .order("date_examen", { ascending: false, nullsFirst: false })
    .limit(40);
  if (site) sel = sel.eq("agence", site);

  const { data, error } = await sel;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, candidats: data ?? [] });
}
