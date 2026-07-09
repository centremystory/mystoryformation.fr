/**
 * MYSTORY — Référentiel du suivi de vérification d'identité (accueil).
 * Pipeline validé par la Direction (09/07/2026) : toutes les étapes, deux voies.
 *   Carte > 10 ans : identité numérique à créer → identité numérique validée
 *   Carte < 10 ans : courrier envoyé → courrier validé · ou vérification en ligne validée
 * Statuts « à suivre » = démarche en cours → relance par l'équipe (bloc accueil).
 */

export const IDENTITE_STATUTS = [
  "identite_numerique_a_creer",
  "identite_numerique_validee",
  "courrier_envoye",
  "courrier_valide",
  "verification_en_ligne_validee",
] as const;

export type IdentiteStatut = (typeof IDENTITE_STATUTS)[number];

export const IDENTITE_LABEL: Record<IdentiteStatut, string> = {
  identite_numerique_a_creer: "Identité numérique à créer",
  identite_numerique_validee: "Identité numérique validée",
  courrier_envoye: "Courrier envoyé (en attente)",
  courrier_valide: "Courrier validé",
  verification_en_ligne_validee: "Vérification en ligne validée",
};

/** Étapes en cours de démarche → à relancer. */
export const IDENTITE_A_SUIVRE: IdentiteStatut[] = ["identite_numerique_a_creer", "courrier_envoye"];

export function identiteBadge(statut: string | null | undefined): { label: string; cls: string } {
  if (!statut) return { label: "Identité non renseignée", cls: "bg-gray-100 text-gray-500" };
  const label = IDENTITE_LABEL[statut as IdentiteStatut] ?? statut;
  const enCours = IDENTITE_A_SUIVRE.includes(statut as IdentiteStatut);
  return { label, cls: enCours ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700" };
}
