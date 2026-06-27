// app/api/dossiers/route.ts — Liste de suivi des dossiers (équipe)
// Lecture seule : dossiers + stagiaire + formatrice + état des pièces.
// Protégé par le middleware global (mot de passe d'équipe).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);
  // Jointure interne sur stagiaires seulement quand on filtre par site (sinon on garde tous les dossiers).
  const jointureStagiaire = site ? "stagiaires!inner ( nom, prenom, agence )" : "stagiaires ( nom, prenom, agence )";
  let q = supabaseAdmin
    .from("dossiers")
    .select(
      `id, certif, financement, statut, statut_tunnel, date_debut, date_fin, token, created_at, stagiaire_id,
       heures_prevues, service_fait_valide, formatrice_libre, satisfaction_froid_envoyee_le,
       niveau_initial, niveau_vise, niveau_atteint,
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
  const dossiers = (data ?? []) as any[];
  // Test initial : le positionnement le plus récent rattaché à chaque dossier.
  const ids = dossiers.map((d) => d.id);
  if (ids.length) {
    const { data: pos } = await supabaseAdmin
      .from("positionnements")
      .select("dossier_id, niveau_global, total_sur20, statut, source, created_at")
      .in("dossier_id", ids)
      .order("created_at", { ascending: false });
    const parDossier = new Map<string, any>();
    (pos ?? []).forEach((p: any) => { if (p.dossier_id && !parDossier.has(p.dossier_id)) parDossier.set(p.dossier_id, p); });
    dossiers.forEach((d) => { d.positionnement = parDossier.get(d.id) ?? null; });
  }
  return NextResponse.json({ ok: true, dossiers, site });
}
