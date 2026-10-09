/**
 * MYSTORY — échapper ce qui vient du dehors, avant de l'écrire dans du HTML.
 *
 * 09/10/2026. Sorti de `app/inscription-examen/route.ts`, où cette fonction vivait en
 * double. Deux fichiers qui échappent « à peu près pareil » finissent toujours par
 * diverger, et c'est celui qu'on ne relit pas qui laisse passer quelque chose.
 *
 * 🔴 POURQUOI C'EST LÀ — à lire avant de trouver le code « plus lisible » sans.
 *
 * Nos formulaires publics sont remplis par des inconnus. Un candidat qui saisit `<b>`
 * comme nom casse la mise en forme de l'e-mail reçu par le secrétariat ; un candidat
 * qui saisit `<img src=x onerror=…>` y fait entrer du balisage actif. Le destinataire
 * est interne, donc la gravité est modérée — mais c'est une boîte qu'on ouvre tous les
 * jours, et c'est trois lignes à écrire.
 *
 * Le réflexe à garder : **toute valeur venue d'un formulaire est hostile jusqu'à preuve
 * du contraire**, y compris dans une page qu'on croit ne renvoyer qu'à son auteur.
 */

/** Échappe les cinq caractères qui changent le sens d'un fragment HTML. */
export const ech = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * Nettoie une valeur destinée à un EN-TÊTE de message (objet, destinataire…).
 *
 * Un retour chariot dans un en-tête permet d'en injecter d'autres — `Bcc:` compris. On
 * ne les échappe donc pas, on les écrase : un objet d'e-mail n'a aucune raison de
 * contenir un saut de ligne. L'échappement HTML ne protège pas de ça, c'est une faille
 * distincte et il faut les deux.
 */
export const enTete = (v: unknown): string =>
  String(v ?? "").replace(/[\r\n]+/g, " ").trim();
