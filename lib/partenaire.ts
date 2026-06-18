/**
 * MYSTORY — Portail partenaire (formateur indépendant / sous-traitant).
 * Accès par jeton (capability) strictement scopé : un partenaire ne voit QUE ses données.
 * Source : table `formateurs` (token), reliée au planning via `formatrice_id`.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export interface Partenaire {
  id: string;
  nom: string;
  prenom: string | null;
  raison_sociale: string | null;
  type: string;
  formatrice_id: string | null;
}

/** Résout un partenaire actif depuis son jeton. null si introuvable/inactif. */
export async function resolverPartenaire(token: string): Promise<Partenaire | null> {
  if (!token || token.length < 10) return null;
  const { data } = await supabaseAdmin
    .from("formateurs")
    .select("id, nom, prenom, raison_sociale, type, formatrice_id, actif")
    .eq("token", token).eq("actif", true).maybeSingle();
  if (!data) return null;
  const { actif, ...p } = data as any;
  return p as Partenaire;
}

const BUCKET = "documents";
async function lien(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Assemble la vue portail : séances/stagiaires assignés, dépôts, conformité. */
export async function assemblerPortail(p: Partenaire) {
  // Séances rattachées à la formatrice liée au partenaire (90 j passés → futur).
  let seances: any[] = [];
  if (p.formatrice_id) {
    const depuis = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabaseAdmin
      .from("planning")
      .select("id, date_seance, demi_journee, heures, heures_realisees, emarge_le, dossier:dossiers!dossier_id ( certif, stagiaire:stagiaires!stagiaire_id ( prenom, nom ) )")
      .eq("formatrice_id", p.formatrice_id)
      .gte("date_seance", depuis)
      .order("date_seance", { ascending: false });
    seances = (data ?? []).map((s: any) => ({
      id: s.id, date_seance: s.date_seance, demi_journee: s.demi_journee,
      heures: s.heures, heures_realisees: s.heures_realisees, emarge: !!s.emarge_le,
      stagiaire: s.dossier?.stagiaire ? `${s.dossier.stagiaire.prenom ?? ""} ${s.dossier.stagiaire.nom ?? ""}`.trim() : "—",
      certif: s.dossier?.certif ?? "",
    }));
  }

  // Dépôts du partenaire (émargement / facture / justificatif).
  const { data: depotsRaw } = await supabaseAdmin
    .from("partenaire_depots")
    .select("id, type, fichier_path, fichier_nom, montant, periode, statut, depose_le")
    .eq("formateur_id", p.id).eq("actif", true)
    .order("depose_le", { ascending: false });
  const depots = await Promise.all((depotsRaw ?? []).map(async (d: any) => ({
    id: d.id, type: d.type, nom: d.fichier_nom, montant: d.montant, periode: d.periode,
    statut: d.statut, depose_le: d.depose_le, url: await lien(d.fichier_path),
  })));

  // Conformité FLE : un justificatif déposé (soumis/validé) suffit à lever l'alerte d'accès au dossier.
  const justif = depots.find((d) => d.type === "justificatif" && d.statut !== "refuse");
  const conformite = {
    justificatif_fle: !!justif,
    statut: justif ? (justif.statut === "valide" ? "Validé" : "En attente de validation") : "Manquant",
  };

  return {
    partenaire: { nom: p.nom, prenom: p.prenom, raison_sociale: p.raison_sociale, type: p.type },
    seances, depots, conformite,
  };
}
