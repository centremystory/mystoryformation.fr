/**
 * MYSTORY — Les trois démarches, et ce qu'elles exigent réellement.
 *
 * 17/09/2026. Le test de positionnement demandait déjà sa démarche au candidat,
 * et en déduisait le niveau de langue exigé. Il s'arrêtait là — or le niveau ne
 * suffit pas : depuis le 1er janvier 2026, chacune de ces démarches réclame DEUX
 * examens, le TEF IRN pour le français et l'examen civique pour la connaissance
 * des principes de la République. Et l'examen civique n'est pas unique : il se
 * passe par MENTION, et la mention doit être celle de la démarche. Un candidat
 * qui passe la mention « carte de résident » alors qu'il demande la nationalité
 * a payé, révisé et s'est déplacé pour un résultat inopposable.
 *
 * Ce fichier est le seul endroit où cette correspondance est écrite. Elle sert
 * au bilan affiché, au courriel du candidat et au récapitulatif interne — trois
 * textes qui, écrits séparément, finiraient par se contredire.
 */

/** Les valeurs telles qu'elles sont enregistrées par le test (colonne `demarche`). */
export type Demarche = "sejour" | "resident" | "naturalisation";

export type FicheDemarche = {
  /** Le nom de la démarche, tel qu'un candidat le dirait. */
  label: string;
  /** Le niveau de français exigé, au sens du CECRL. */
  niveau: "A2" | "B1" | "B2";
  /** La mention de l'examen civique — elle DOIT être celle de la démarche. */
  mentionCivique: string;
  /** Les deux examens à passer, dans l'ordre où on les présente. */
  examens: string[];
};

export const DEMARCHES: Record<Demarche, FicheDemarche> = {
  sejour: {
    label: "Carte de séjour pluriannuelle",
    niveau: "A2",
    mentionCivique: "carte de séjour pluriannuelle",
    examens: ["TEF IRN — niveau A2", "Examen civique — mention carte de séjour pluriannuelle"],
  },
  resident: {
    label: "Carte de résident",
    niveau: "B1",
    mentionCivique: "carte de résident",
    examens: ["TEF IRN — niveau B1", "Examen civique — mention carte de résident"],
  },
  naturalisation: {
    label: "Naturalisation française",
    niveau: "B2",
    mentionCivique: "naturalisation",
    examens: ["TEF IRN — niveau B2", "Examen civique — mention naturalisation"],
  },
};

/** Tolérant à ce qui arrive vraiment en base : casse, accents, libellé complet. */
export function ficheDemarche(valeur?: string | null): FicheDemarche | null {
  const v = String(valeur ?? "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!v) return null;
  if (v.startsWith("sejour") || v.includes("pluriannuel")) return DEMARCHES.sejour;
  if (v.startsWith("resident") || v.includes("residen")) return DEMARCHES.resident;
  if (v.startsWith("natural")) return DEMARCHES.naturalisation;
  return null;
}

/**
 * « Pour votre carte de résident, deux examens sont nécessaires : … »
 *
 * Renvoie une chaîne vide quand la démarche est inconnue : mieux vaut ne rien
 * dire que d'annoncer à quelqu'un la mauvaise mention d'examen civique.
 */
export function phraseExamensRequis(valeur?: string | null): string {
  const f = ficheDemarche(valeur);
  if (!f) return "";
  return `Pour votre démarche « ${f.label} », deux examens sont nécessaires : ` +
    `le TEF IRN au niveau ${f.niveau}, et l'examen civique mention « ${f.mentionCivique} ».`;
}
