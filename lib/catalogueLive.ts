// lib/catalogueLive.ts — Catalogue "live" lu depuis offres_formules (source éditable via /catalogue).
// Relie le catalogue éditable au formulaire d'inscription + au montant + au gate CDC, pour que
// les modifications faites dans /catalogue se répercutent partout (fin du catalogue codé en dur).
// Mapping par DURÉE (unique en v6 : 6/9/12/15/18/21/24/27/30/33/36/39/45 h → 1 CodeFormule).
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
      const code = formuleParHeures(Number(r.heures));
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

/** Prix officiel par durée (pour le gate CDC) : offres_formules d'abord, sinon CATALOGUE. */
export async function prixLiveParHeures(heures: number): Promise<number | null> {
  const code = formuleParHeures(heures);
  if (!code) return null;
  const live = await catalogueLive();
  return live[code]?.prix ?? CATALOGUE[code]?.prixEuros ?? null;
}
