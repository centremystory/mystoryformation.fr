/**
 * MYSTORY — Ce que les quatre pages à lien nominatif partagent à l'ÉCRAN et en SORTIE.
 *
 * 09/10/2026. Séparé de `lib/liensCandidat.ts` à dessein : ce module-ci importe
 * `lib/pagePublique.ts` et `lib/email.ts`, donc il ne peut servir que dans une
 * route serveur. `liensCandidat.ts` reste importable de partout.
 */
import { NextResponse } from "next/server";
import { ech, enTete } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Où partent les notifications de ces quatre pages.
 *
 * Décision du dirigeant du 09/10/2026 : `secretariat@` pour l'administratif
 * interne, `contact@` pour les demandes entrantes et l'expédition visible par
 * le candidat. Une voie d'identité choisie, un devis accepté, une demande
 * d'exonération : tout cela est ADMINISTRATIF, donc tout part au secrétariat.
 *
 * `EMAIL_CORRECTIONS` est lu en priorité : c'est la variable que tout le CRM
 * utilise déjà pour rerouter les notifications internes d'un coup.
 *
 * ⚠️ Jamais `mystory.formation@gmail.com`, qui traîne encore dans plusieurs
 * automatisations et n'est pas une adresse de travail.
 */
export const DESTINATAIRE_INTERNE =
  process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr";

/**
 * La base des liens que nous mettons dans les courriels.
 *
 * `APP_URL` si elle est posée, sinon le domaine du CRM EN DUR, et rien d'autre.
 * Surtout pas un en-tête de la requête (`Origin`, `x-forwarded-host`, `host`) :
 * ils sont tous écrits par le CLIENT, et Vercel n'en corrige aucun. Le scénario
 * complet est écrit dans lib/appUrl.ts — un lien que NOUS envoyons, depuis notre
 * domaine, avec SPF et DKIM valides, mais qui mène chez un attaquant.
 */
export function baseCrm(): string {
  return (process.env.APP_URL?.trim() || "https://crm.mystoryformation.fr").replace(/\/+$/, "");
}

/**
 * La page de refus, commune aux quatre liens.
 *
 * 🔴 ELLE NE DIT JAMAIS POURQUOI. Jeton inconnu, périmé, révoqué, ou d'un autre
 * type : le même écran. Distinguer les cas donnerait un oracle — « ce jeton a
 * existé » est déjà une information — et nos candidats sont des personnes en
 * démarche de naturalisation ou de titre de séjour. « Cette personne a un
 * dossier chez vous » ne se confirme à personne, même implicitement.
 *
 * Elle reste pour autant UTILE : un lien périmé est le cas de loin le plus
 * fréquent, et la bonne réponse est un numéro de téléphone, pas un code
 * d'erreur. On ne laisse pas le candidat devant « 403 ».
 *
 * `atouts: false` : le bandeau de réassurance (habilitation CCI, paiement
 * sécurisé) n'a rien à faire sur un écran de refus — il y sonne faux.
 */
export function refusLienHtml(sujet: string): NextResponse {
  const corps = `<div class="carte centre">
  <div class="rond ambre">⏳</div>
  <h1>Ce lien n'est plus valable</h1>
  <p class="sous">Les liens que nous envoyons ont une durée de vie limitée, pour la sécurité de
  votre dossier. Celui-ci a expiré, ou il a été remplacé par un plus récent — vérifiez si vous
  avez reçu un courriel plus récent de notre part.</p>
  <p class="sous">Nous vous en renvoyons un tout de suite : appelez-nous, c'est l'affaire d'une
  minute.</p>
  <a class="tel" href="tel:+33681431654">${TEL_PUBLIC}</a>
  <p class="note">Ou écrivez-nous à <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>
  en précisant votre nom et votre prénom.</p>
</div>`;
  return new NextResponse(
    pagePublique({ titre: sujet, corps, largeur: 620, atouts: false }),
    { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/**
 * Journalise une action de candidat.
 *
 * 🔴 `journal` est la SEULE surface de ce CRM qui se remplisse vraiment : 841
 * lignes en 90 jours, là où `taches`, `remarques`, `messages_internes` et
 * `reclamations` sont à 0. La raison est simple — elle est écrite par des
 * machines, pas à la main. Toute trace de ces pages va donc là, et nulle part
 * ailleurs : une ligne dans une table que personne ne consulte serait une ligne
 * perdue.
 *
 * Ne lève jamais : une trace qui échoue ne doit pas faire perdre au candidat
 * l'action qu'il vient de faire.
 */
export async function journaliser(
  evenement: string, dossierId: string | null, detail: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "liens_candidat", entite_id: dossierId, evenement,
      nouvelle_valeur: detail, auteur: "candidat",
    });
  } catch { /* le journal ne bloque jamais le flux métier */ }
}

/**
 * Prévient le secrétariat.
 *
 * ⚠️ Un échec d'envoi n'ANNULE RIEN. Le choix du candidat est enregistré en
 * base, c'est la notification qui a manqué — et c'est une ligne à rattraper, pas
 * une action à refaire. C'est la leçon de la panne de convocations des 09 et
 * 10/09/2026 : un échec déguisé en succès a laissé croire pendant deux jours
 * que des courriels étaient partis. On rend donc l'état réel de l'envoi, et
 * l'appelant le journalise.
 *
 * Le corps est passé en HTML déjà ÉCHAPPÉ par l'appelant : tout ce qui vient
 * d'un formulaire est hostile jusqu'à preuve du contraire, y compris dans un
 * message qui ne va qu'à une boîte interne qu'on ouvre tous les jours.
 */
export async function prevenirSecretariat(
  objet: string, titre: string, corpsHtml: string, dossierId?: string | null,
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    return await envoyerEmail({
      a: DESTINATAIRE_INTERNE,
      objet: enTete(objet),
      html: gabaritEmail(titre, corpsHtml),
      // Traçabilité : l'envoi se retrouve dans le journal à côté de l'action du
      // candidat qui l'a déclenché, et non dans un tas « email » indifférencié.
      entite: "liens_candidat",
      entiteId: dossierId ?? undefined,
      auteur: "candidat",
    });
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "inconnue" };
  }
}

/** Une ligne « libellé : valeur » pour les courriels internes. Échappe la valeur. */
export function ligneInterne(libelle: string, valeur: unknown): string {
  return `<p style="margin:4px 0"><b>${ech(libelle)}</b> : ${ech(valeur ?? "—")}</p>`;
}
