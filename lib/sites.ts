/**
 * MYSTORY — Sites (agences) — source unique de vérité.
 * ⚠️ GARDE-FOU QUALIOPI : ce filtre est une LENTILLE INTERNE (reporting / listes).
 * Le lieu de formation et le « Fait à » des documents restent TOUJOURS Gagny
 * (forcé dans lib/mergeEngine.ts). Ce module ne doit jamais piloter une pièce.
 *
 * Pur (aucun import serveur) → utilisable côté client (sélecteur NavBar) ET serveur.
 */
export const SITES = ["Gagny", "Sarcelles", "Rosny"] as const;
export type Site = (typeof SITES)[number];

/** Valeur du filtre global : "" = tous les sites, sinon un site. */
export type SiteFiltre = "" | Site;

/** Nom du cookie portant le site choisi dans la barre du haut. */
export const COOKIE_SITE = "mystory_site";

/** Normalise une valeur quelconque en filtre sûr ("" si inconnue). */
export function siteValide(v: string | undefined | null): SiteFiltre {
  return v && (SITES as readonly string[]).includes(v) ? (v as Site) : "";
}
