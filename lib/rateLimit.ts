/**
 * MYSTORY — Limitation de débit (anti-bruteforce / anti-spam).
 * Compteur partagé en base (table rate_buckets + fonction atomique rate_hit), donc fiable
 * même en serverless (plusieurs instances). Fail-open : si le compteur échoue, on ne bloque pas
 * (la disponibilité prime ; un attaquant ne peut pas provoquer le déblocage).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Adresse IP de l'appelant (1re valeur de x-forwarded-for). */
export function ipDe(req: { headers: Headers }): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || "inconnue";
}

/** true si la limite est dépassée pour `cle` (max requêtes sur la fenêtre `fenetreSec`). */
export async function limiteDepassee(cle: string, max: number, fenetreSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / fenetreSec);
  const { data, error } = await supabaseAdmin.rpc("rate_hit", { p_cle: cle, p_bucket: bucket });
  if (error) return false; // fail-open
  return Number(data ?? 0) > max;
}
