/**
 * MYSTORY — Limitation de débit (anti-bruteforce / anti-spam).
 * Compteur partagé en base (table rate_buckets + fonction atomique rate_hit), donc fiable
 * même en serverless (plusieurs instances). Fail-open : si le compteur échoue, on ne bloque pas
 * (la disponibilité prime ; un attaquant ne peut pas provoquer le déblocage).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Adresse IP de l'appelant (1re valeur de x-forwarded-for).
 *
 * ⚠️ 09/10/2026 — CETTE LECTURE EST FALSIFIABLE, et ce n'est pas théorique.
 * `x-forwarded-for` est un en-tête que le CLIENT peut envoyer lui-même. Vercel
 * y AJOUTE la vraie adresse à droite, mais ne retire pas ce que le client a mis
 * à gauche : prendre la première valeur, c'est prendre ce que l'appelant a
 * choisi. Une boucle qui change d'en-tête à chaque requête n'est donc jamais
 * limitée du tout.
 *
 * Toutes les routes qui appellent `ipDe()` partagent ce défaut. Les corriger
 * d'un coup change le comportement d'une dizaine de routes publiques (connexion,
 * pré-inscription, kiosque…) : c'est un chantier à mener sur sa propre branche,
 * avec un passage en revue de chacune. En attendant, les NOUVELLES routes
 * utilisent `ipDeConfiance()` ci-dessous. */
export function ipDe(req: { headers: Headers }): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || "inconnue";
}

/**
 * L'adresse IP telle que la PLATEFORME la voit — la seule qu'on ne puisse pas écrire.
 *
 * Trois sources, dans l'ordre de confiance :
 *
 *   1. `x-vercel-forwarded-for` — posé par le proxy Vercel lui-même, après
 *      réécriture. Un en-tête du même nom envoyé par le client est écrasé.
 *   2. La valeur la plus à DROITE de `x-forwarded-for` — celle que le dernier
 *      proxy a ajoutée, donc l'adresse qu'il a réellement vue. Tout ce qui est à
 *      sa gauche peut avoir été inventé par l'appelant.
 *   3. `x-real-ip`, en dernier recours.
 *
 * Renvoie « inconnue » si rien n'est exploitable. Ce cas doit être traité comme
 * une IP ordinaire par l'appelant — donc limité — sinon il suffirait de n'envoyer
 * aucun en-tête pour échapper au compteur.
 */
export function ipDeConfiance(req: { headers: Headers }): string {
  const vercel = (req.headers.get("x-vercel-forwarded-for") ?? "").split(",").pop()?.trim();
  if (vercel) return vercel;
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim();
  if (xff) return xff;
  return (req.headers.get("x-real-ip") ?? "").trim() || "inconnue";
}

/** true si la limite est dépassée pour `cle` (max requêtes sur la fenêtre `fenetreSec`). */
export async function limiteDepassee(cle: string, max: number, fenetreSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / fenetreSec);
  const { data, error } = await supabaseAdmin.rpc("rate_hit", { p_cle: cle, p_bucket: bucket });
  if (error) return false; // fail-open
  return Number(data ?? 0) > max;
}
