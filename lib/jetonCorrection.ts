/**
 * MYSTORY — Jeton de correction d'une évaluation (lien envoyé à la formatrice).
 *
 * Pourquoi un jeton dérivé et non une colonne en base : le jeton d'une évaluation
 * (`evaluations.token`) est déjà connu du CANDIDAT — c'est celui de sa passation.
 * Le réutiliser pour l'écran de notation laisserait un candidat se noter lui-même.
 * On signe donc l'identifiant avec le secret serveur : la signature est
 * indevinable, ne coûte aucune migration, et se révoque en faisant tourner
 * AUTH_SECRET.
 *
 * Domaine de signature explicite : une signature de correction ne peut pas être
 * rejouée ailleurs (session, autre lien signé) même si la même clé sert partout.
 */
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "";
const DOMAINE = "mystory:correction-evaluation:v1";

/** Signature d'une évaluation. Chaîne vide si aucun secret n'est configuré :
 *  sans secret on ne fabrique PAS de lien, plutôt que d'en fabriquer un forgeable. */
export function signerCorrection(id: string): string {
  if (!SECRET || !id) return "";
  return createHmac("sha256", SECRET)
    .update(`${DOMAINE}:${id}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Vérification à temps constant. Refuse toujours si le secret manque. */
export function jetonCorrectionValide(id: string, signature: unknown): boolean {
  const attendue = signerCorrection(id);
  if (!attendue) return false;
  const fournie = String(signature ?? "");
  if (fournie.length !== attendue.length) return false;
  try {
    return timingSafeEqual(Buffer.from(fournie), Buffer.from(attendue));
  } catch {
    return false;
  }
}

/** Le lien complet à mettre dans l'e-mail. Chaîne vide si le jeton n'a pas pu être
 *  signé — l'appelant retombe alors sur le lien classique du back-office. */
export function lienCorrection(base: string, id: string): string {
  const sig = signerCorrection(id);
  if (!sig) return "";
  return `${base.replace(/\/+$/, "")}/tests/corriger/${id}?c=${sig}`;
}
