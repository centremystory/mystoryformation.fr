/**
 * MYSTORY — URL de base des liens que nous envoyons par courriel.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 🔴 CETTE FONCTION NE LIT PLUS AUCUN EN-TÊTE DE LA REQUÊTE. JAMAIS.          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * 09/10/2026. Jusqu'à aujourd'hui, à défaut d'`APP_URL`, elle se repliait sur
 * `Origin`, puis `x-forwarded-host`, puis `host`. Les trois sont envoyés par le
 * CLIENT : une requête les écrit comme elle veut. Vercel ajoute la vraie valeur à
 * droite de `x-forwarded-for`, mais ne corrige RIEN dans `host` ni dans
 * `x-forwarded-host`.
 *
 * ── LE SCÉNARIO, pour qu'on n'ait pas à le redécouvrir ──────────────────────────
 *
 * Le pire appelant est `app/api/auth/mot-de-passe-oublie/route.ts`, qui construit
 * avec ça un **lien de réinitialisation de mot de passe** :
 *
 *   1. un attaquant poste une demande de réinitialisation pour le compte d'une de
 *      nos salariées, en ajoutant `X-Forwarded-Host: site-pirate.fr` ;
 *   2. nous lui envoyons NOUS-MÊMES, depuis notre domaine, avec SPF et DKIM
 *      valides et notre mise en forme habituelle, un courriel dont le lien
 *      « réinitialiser mon mot de passe » mène chez l'attaquant ;
 *   3. elle clique — elle a vraiment demandé ce message, il vient vraiment de
 *      nous — et saisit son nouveau mot de passe chez lui.
 *
 * Aucun moyen pour elle de s'en apercevoir. Et le même empoisonnement visait les
 * `urlRetour` de paiement de `/api/commande` et `/api/inscription-examen` : un
 * candidat renvoyé chez un tiers juste après avoir payé, au moment précis où il
 * attend une confirmation.
 *
 * ── LE CORRECTIF ───────────────────────────────────────────────────────────────
 *
 * `APP_URL` si elle est posée, sinon le domaine du CRM écrit EN DUR. Rien d'autre.
 *
 * Le repli en dur est préférable à une erreur : sans lui, un oubli de variable
 * d'environnement couperait tous les liens sortants du CRM. Et une URL en dur
 * fausse se voit au premier essai, alors qu'une URL empoisonnée ne se voit jamais.
 *
 * ⚠️ Le repli était `https://mystoryformation.fr` — le SITE VITRINE, qui est
 * statique et n'a aucune de ces routes. Un lien de réinitialisation, un lien de
 * correction ou un webhook de paiement construits dessus tombaient en 404. Le
 * repli correct est le CRM.
 *
 * ⚠️ `_req` est CONSERVÉ et volontairement inutilisé : la signature ne change pas,
 * donc les huit appelants (`mot-de-passe-oublie`, `comptes`, `commande`,
 * `inscription-examen`, `tests/notation`, `tests/corriger`,
 * `tests/relances-correction`) bénéficient du correctif SANS être modifiés — deux
 * d'entre eux encaissent de l'argent aujourd'hui et sont en cours de refonte par
 * ailleurs. Ne pas « nettoyer » ce paramètre : le retirer obligerait à toucher
 * huit fichiers pour rien, et quelqu'un finirait par le remettre à lire des
 * en-têtes.
 *
 * Pour les envois NON interactifs (cron, n8n), définir `APP_URL` reste la bonne
 * pratique — mais ce n'est plus une condition de sécurité, seulement de réglage.
 */
export function urlDeBase(_req?: Request): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://crm.mystoryformation.fr";
}
