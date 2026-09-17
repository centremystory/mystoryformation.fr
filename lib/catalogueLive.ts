// lib/catalogueLive.ts — Catalogue "live" lu depuis offres_formules (source éditable via /catalogue).
// Relie le catalogue éditable au formulaire d'inscription + au montant + au gate CDC, pour que
// les modifications faites dans /catalogue se répercutent partout (fin du catalogue codé en dur).
// 17/09/2026 — mapping par (NIVEAU VISÉ, DURÉE). La durée seule ne suffit plus :
// 24 h existe pour A2, B1 et B2, et indexer sur elle faisait écraser deux offres
// sur trois — la dernière ligne lue gagnait, au hasard de l'ordre de la table.
import { supabaseAdmin } from "./supabaseAdmin";
import { formuleParHeures, CATALOGUE, type CodeFormule } from "./inscriptions/regles";

export type FormuleLive = {
  code: CodeFormule; nom: string; prix: number; offreIntitule: string;
  niveauVise: string; heures: number; seances: number | null;
};

/** Formules actives d'offres_formules, indexées par CodeFormule (via la durée). */
export async function catalogueLive(): Promise<Record<string, FormuleLive>> {
  const out: Record<string, FormuleLive> = {};
  try {
    const { data } = await supabaseAdmin
      .from("offres_formules")
      .select("offre_intitule, vise_niveau, formule_nom, heures, seances, prix_eur, actif")
      .eq("actif", true);
    for (const r of (data ?? []) as any[]) {
      const niveau = String(r.vise_niveau ?? "").trim().toUpperCase();
      const offre = niveau === "A2" || niveau === "B1" || niveau === "B2" ? niveau : undefined;
      const code = formuleParHeures(Number(r.heures), offre);
      if (!code) continue;
      out[code] = {
        code, nom: String(r.formule_nom ?? ""), prix: Number(r.prix_eur),
        offreIntitule: String(r.offre_intitule ?? ""), niveauVise: String(r.vise_niveau ?? ""),
        heures: Number(r.heures), seances: r.seances != null ? Number(r.seances) : null,
      };
    }
  } catch { /* fallback = catalogue codé en dur (ci-dessous) */ }
  return out;
}

/** Prix officiel d'une formule (offres_formules si dispo, sinon CATALOGUE codé en dur). */
export async function prixLive(code: CodeFormule): Promise<number> {
  const live = await catalogueLive();
  return live[code]?.prix ?? CATALOGUE[code].prixEuros;
}

/**
 * Prix officiel par durée, pour le gate CDC.
 *
 * Sans offre, c'est volontaire et sans risque ici : depuis le 09/09 le barème est
 * unique — 180 € + 40 €/h — donc 24 h vaut 1 140 € que ce soit A2, B1 ou B2. Seul
 * le PROGRAMME dépend de l'offre, jamais le prix.
 */
export async function prixLiveParHeures(heures: number): Promise<number | null> {
  const code = formuleParHeures(heures);
  if (!code) return null;
  const live = await catalogueLive();
  return live[code]?.prix ?? CATALOGUE[code]?.prixEuros ?? null;
}
