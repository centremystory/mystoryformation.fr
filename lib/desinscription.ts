/**
 * MYSTORY — Le lien de désinscription, signé.
 *
 * 17/09/2026. Une campagne vers d'anciens clients doit porter un moyen de s'y
 * opposer en un clic. Un lien qui contiendrait simplement l'adresse en clair
 * (`?email=…`) laisserait n'importe qui désinscrire n'importe qui, y compris en
 * boucle sur toute la liste : il suffirait d'avoir reçu un seul message pour
 * deviner la forme de l'URL.
 *
 * On signe donc l'adresse avec le secret du serveur. Le lien ne vaut que pour
 * l'adresse qu'il porte, et il n'apprend rien à qui le lit.
 *
 * Le même mécanisme que `lib/jetonCorrection.ts`, avec un DOMAINE distinct : une
 * signature émise pour une correction ne doit jamais valoir pour une
 * désinscription, sans quoi un jeton fuité servirait deux fois.
 */
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "";
const DOMAINE = "mystory:desinscription:v1";
const BASE = process.env.APP_URL ?? "https://crm.mystoryformation.fr";

function signer(email: string): string {
  if (!SECRET || !email) return "";
  return createHmac("sha256", SECRET)
    .update(`${DOMAINE}:${email.trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 32);
}

/** L'URL complète à mettre dans le pied du message. */
export function lienDesinscription(email: string): string {
  const e = email.trim().toLowerCase();
  const s = signer(e);
  if (!s) return `${BASE}/desinscription`;
  return `${BASE}/desinscription?e=${encodeURIComponent(e)}&s=${s}`;
}

/**
 * Vérifie une signature reçue.
 *
 * Comparaison à temps constant : comparer deux chaînes avec `===` s'arrête au
 * premier caractère différent, et cette durée se mesure. C'est peu exploitable
 * ici, mais la bonne habitude coûte une ligne.
 */
export function signatureValide(email: string, signature: string): boolean {
  const attendue = signer(email);
  if (!attendue || !signature || attendue.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(attendue), Buffer.from(signature));
  } catch {
    return false;
  }
}
