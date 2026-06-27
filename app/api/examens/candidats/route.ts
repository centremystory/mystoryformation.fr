// app/api/examens/candidats/route.ts — Liste unifiée des candidats d'examen (lecture seule)
// Source : vue public.v_candidats_examen (historique import + ventes vivantes), enrichie du résultat saisi.
// Protégé par le middleware global. Données personnelles → service_role uniquement.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";
import { statutExamen } from "@/lib/statutExamen";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);
  let q = supabaseAdmin
    .from("v_candidats_examen")
    .select(
      "id, source, nom, prenom, civilite, email, telephone, type_brut, type_norm, sous_type, date_examen, horaire, agence, statut_paiement, numero_attestation, numero_facture, vendu_par, montant, a_confirmer, date_inscription, attestation_nom, attestation_depose_le, candidat_id"
    )
    .order("date_examen", { ascending: false, nullsFirst: false })
    .order("nom", { ascending: true });
  if (site) q = q.eq("agence", site);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  // Résultats saisis : ventes mappées par vente_id, candidats importés par examen_ref+source.
  const { data: resultats } = await supabaseAdmin
    .from("resultats_examen")
    .select("vente_id, examen_ref, source, statut, niveau_obtenu, envoye_le, commentaire");
  const parVente = new Map<string, any>();
  const parImport = new Map<string, any>();
  for (const r of (resultats ?? []) as any[]) {
    if (r.vente_id) parVente.set(r.vente_id, r);
    if (r.examen_ref && r.source === "import") parImport.set(r.examen_ref, r);
  }

  const candidats = (data ?? []).map((c: any) => {
    const r = c.source === "vente" ? parVente.get(c.id) : parImport.get(c.id);
    const resultat = r ? { statut: r.statut, niveau_obtenu: r.niveau_obtenu, envoye_le: r.envoye_le, commentaire: r.commentaire } : null;
    const statut = statutExamen({ statut_paiement: c.statut_paiement, date_examen: c.date_examen, resultat });
    return { ...c, resultat, statut_examen: statut };
  });

  return NextResponse.json({ ok: true, candidats });
}
