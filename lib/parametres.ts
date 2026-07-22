// MYSTORY — Paramètres éditables (table public.parametres, page /reglages).
// Permet à la Direction de régler des valeurs (seuils, coordonnées…) sans déploiement.
// Cache mémoire court par instance serverless pour éviter un aller-retour DB à chaque appel.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

let cache: Record<string, string> | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

async function charger(): Promise<Record<string, string>> {
  const maintenant = Date.now();
  if (cache && maintenant - cacheAt < TTL_MS) return cache;
  const { data } = await supabaseAdmin.from("parametres").select("cle, valeur");
  const m: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ cle: string; valeur: string }>) m[r.cle] = r.valeur;
  cache = m;
  cacheAt = maintenant;
  return m;
}

/** Valeur texte d'un paramètre, avec repli sur `defaut` si absent. */
export async function getParam(cle: string, defaut: string): Promise<string> {
  const m = await charger();
  return m[cle] ?? defaut;
}

/** Valeur numérique d'un paramètre (repli sur `defaut` si absent/invalide). */
export async function getParamNumber(cle: string, defaut: number): Promise<number> {
  const v = Number(await getParam(cle, String(defaut)));
  return Number.isFinite(v) ? v : defaut;
}

/** À appeler après une écriture pour rafraîchir immédiatement. */
export function viderCacheParametres(): void {
  cache = null;
  cacheAt = 0;
}
