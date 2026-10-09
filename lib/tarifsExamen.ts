/**
 * MYSTORY — grille tarifaire des examens, côté serveur.
 *
 * 28/09/2026. Elle vit ici et NULLE PART AILLEURS pour l'inscription en ligne : le
 * montant n'est jamais envoyé par le navigateur, il est recalculé à la réception.
 * Un prix qui transite par un formulaire est un prix qu'on peut modifier avec les
 * outils de développement — et on encaisserait alors 1 € pour un examen à 185 €.
 *
 * Ces montants doivent rester alignés sur `src/lib/tarifs-examen.ts` du site public,
 * qui les AFFICHE. Le site montre, le CRM facture : en cas de désaccord, c'est
 * toujours le CRM qui a raison, et l'écart doit être corrigé côté site.
 */

export type TypeExamen = "TEF_IRN" | "Examen_civique";

/**
 * Une inscription prise à moins de 7 jours OUVRÉS de la session relève du tarif d'urgence.
 *
 * 28/09/2026 — ce sont bien des jours OUVRÉS, pas des jours calendaires (règle rappelée par
 * Arudhan). L'écart n'est pas anodin : 7 jours ouvrés font 9 à 11 jours calendaires selon
 * l'endroit où tombe le week-end. Compter en jours calendaires ferait payer 185 € une
 * inscription qui relève des 250 €.
 *
 * Samedi et dimanche sont exclus. ⚠️ MYSTORY reçoit le samedi : si la direction considère
 * le samedi comme ouvré, changer JOURS_OUVRES ci-dessous — c'est le seul endroit à toucher.
 */
export const DELAI_TARIF_PUBLIC_JOURS_OUVRES = 7;

/** Jours de la semaine comptés comme ouvrés (0 = dimanche … 6 = samedi). */
const JOURS_OUVRES = new Set([1, 2, 3, 4, 5]);

/** Tarifs d'une inscription prise au moins 7 jours OUVRÉS à l'avance. */
export const TARIFS_PUBLICS: Record<TypeExamen, number> = {
  TEF_IRN: 185,
  Examen_civique: 80,
};

/**
 * Tarifs d'une inscription prise À MOINS DE 7 JOURS OUVRÉS.
 *
 * Ce n'est pas une pénalité : caler un candidat sur une liste déjà arrêtée suppose
 * de la rouvrir, de prévenir la CCI et de produire la convocation dans la journée.
 */
export const TARIFS_URGENCE: Record<TypeExamen, number> = {
  TEF_IRN: 250,
  Examen_civique: 100,
};

/* ─────────────────────────────────────────────────────────────────────────────
   🗑️ LA TABLE DES PLATEFORMES A ÉTÉ SUPPRIMÉE D'ICI — 09/10/2026
   ─────────────────────────────────────────────────────────────────────────────
   Elle annonçait « Passetontef, 15 € » alors que le site en vend 35 €, et le
   prix de ce fichier est censé être celui qui FACTURE. Vérification faite avant
   de toucher quoi que ce soit :

     · `PLATEFORMES` n'était lue que par `calculerMontant()`, juste en dessous ;
     · les deux seuls appels à `calculerMontant()` — `app/inscription-examen/route.ts`
       et `app/api/inscription-examen/route.ts` — passaient `[]`.

   La table était donc morte, et son prix faux. On ne l'a pas « corrigée à 35 € » :
   il existe déjà un barème vivant et déduit des packs publiés, `PLATEFORMES_COMMANDE`
   dans `lib/commande.ts` (PasseTonTEF 35 €, PrepMyFuture 65 €), et deux tables qui
   annoncent le même prix finissent toujours par se contredire — c'est précisément
   ce qui a produit l'écart 15 ≠ 35.

   Un prix faux qui dort finit par se réveiller : le plus sûr est qu'il n'existe
   plus. Le paramètre `plateformes` de `calculerMontant()` disparaît avec elle,
   pour qu'aucun appelant ne puisse croire qu'il sait facturer une plateforme.
   Le seul chemin qui en vend est `/commande`, qui ne passe pas par ici.

   `prepcivique` avait déjà été retiré le même jour (décision du dirigeant, « ne
   propose nulle part prepcivique.fr ») : MYSTORY ne dispense aucune formation
   civique, le contrat d'intégration républicaine relevant exclusivement de l'OFII.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Nombre de jours OUVRÉS entre aujourd'hui (Paris) et la date d'examen.
 *
 * On compte du lendemain jusqu'au jour de l'examen inclus : c'est le nombre de jours
 * de travail dont l'équipe dispose réellement pour inscrire le candidat à la CCI et
 * produire sa convocation. Un examen déjà passé renvoie 0.
 */
export function joursOuvresAvant(dateExamen: string): number {
  const cible = new Date(`${dateExamen}T00:00:00`);
  cible.setHours(0, 0, 0, 0);
  const jour = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  jour.setHours(0, 0, 0, 0);
  if (cible <= jour) return 0;

  let n = 0;
  // Borne de sécurité : au-delà d'un an, la réponse ne change plus la décision.
  for (let i = 0; i < 400; i++) {
    jour.setDate(jour.getDate() + 1);
    if (JOURS_OUVRES.has(jour.getDay())) n += 1;
    if (jour.getTime() >= cible.getTime()) break;
  }
  return n;
}

export type Devis = {
  montant: number;
  urgence: boolean;
  detail: Array<{ libelle: string; prix: number }>;
};

/**
 * Calcule ce que doit payer un candidat pour UNE session d'examen. Seule source
 * du montant encaissé sur ce chemin-là.
 *
 * Ne sait facturer que l'examen, délibérément : une plateforme d'entraînement ne
 * se vend que par `/commande`, qui a son propre barème (`PLATEFORMES_COMMANDE`
 * dans `lib/commande.ts`). Voir le pavé ci-dessus pour le pourquoi.
 */
export function calculerMontant(type: TypeExamen, dateExamen: string): Devis {
  const jours = joursOuvresAvant(dateExamen);
  const urgence = jours < DELAI_TARIF_PUBLIC_JOURS_OUVRES;
  const prixExamen = urgence ? TARIFS_URGENCE[type] : TARIFS_PUBLICS[type];

  const detail: Array<{ libelle: string; prix: number }> = [
    {
      libelle:
        (type === "TEF_IRN" ? "Examen TEF IRN" : "Examen civique") +
        (urgence ? " — tarif d'urgence (session à moins de 7 jours ouvrés)" : ""),
      prix: prixExamen,
    },
  ];

  return { montant: detail.reduce((n, d) => n + d.prix, 0), urgence, detail };
}
