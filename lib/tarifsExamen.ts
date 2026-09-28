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

/** Options d'entraînement, ajoutées au montant de l'examen. */
export const PLATEFORMES: Record<string, { libelle: string; prix: number }> = {
  passetontef: { libelle: "Passetontef — entraînement TEF IRN", prix: 15 },
  prepcivique: { libelle: "Prepcivique — entraînement examen civique", prix: 20 },
};

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
 * Calcule ce que doit payer un candidat. Seule source du montant encaissé.
 *
 * `plateformes` est filtré sur les clés connues : une valeur inventée est ignorée
 * plutôt que de faire échouer l'inscription — le candidat n'y est pour rien.
 */
export function calculerMontant(
  type: TypeExamen,
  dateExamen: string,
  plateformes: string[] = [],
): Devis {
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

  for (const cle of plateformes) {
    const p = PLATEFORMES[String(cle).toLowerCase()];
    if (p && !detail.some((d) => d.libelle === p.libelle)) {
      detail.push({ libelle: p.libelle, prix: p.prix });
    }
  }

  return { montant: detail.reduce((n, d) => n + d.prix, 0), urgence, detail };
}
