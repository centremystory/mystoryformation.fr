/**
 * MYSTORY — Dire le niveau en français, pas en jargon.
 *
 * 17/09/2026, demande d'Arudhan. Le candidat recevait « Niveau En deça de A2 »
 * en gros dans un cadre bleu. C'est exact au sens du CECRL, illisible pour
 * quelqu'un dont c'est justement le français qui est en jeu, et décourageant.
 *
 * Le code et la base continuent de stocker A2 / B1 / B2 — ce sont les valeurs
 * qui partent au dossier, à la convention et aux pièces Qualiopi. Ce module ne
 * sert qu'à l'AFFICHAGE : e-mail candidat, écran de fin de test.
 */

export type NiveauLisible = {
  /** Le titre, en français courant. */
  titre: string;
  /** Ce que ce niveau permet concrètement, en une phrase. */
  explication: string;
  /** Le libellé CECRL, à garder en petit à côté — c'est celui de l'examen. */
  code: string;
  /** Couleurs de l'encadré : fond, bordure, texte. */
  fond: string;
  bord: string;
  encre: string;
};

const SOUS_A2: NiveauLisible = {
  titre: "Les bases sont à consolider",
  explication:
    "Le premier niveau officiel, le A2, n'est pas encore atteint. Ce n'est pas un échec : "
    + "c'est un point de départ, et c'est exactement ce qu'une formation sert à faire bouger.",
  code: "en deçà de A2",
  fond: "#FFF7ED", bord: "#FED7AA", encre: "#92400E",
};

const TABLE: Record<string, NiveauLisible> = {
  A2: {
    titre: "Vous vous débrouillez au quotidien",
    explication:
      "Vous comprenez et vous vous faites comprendre dans les situations courantes : "
      + "démarches, travail, vie de tous les jours. C'est le niveau demandé pour la "
      + "carte de séjour pluriannuelle.",
    code: "A2", fond: "#EFF6FF", bord: "#D7E6FB", encre: "#1A4488",
  },
  B1: {
    titre: "Vous êtes autonome",
    explication:
      "Vous suivez une conversation à vitesse normale, vous racontez, vous donnez votre avis "
      + "et vous vous débrouillez avec l'administration. C'est le niveau demandé pour la "
      + "carte de résident de dix ans.",
    code: "B1", fond: "#EFF6FF", bord: "#D7E6FB", encre: "#1A4488",
  },
  B2: {
    titre: "Vous argumentez et vous nuancez",
    explication:
      "Vous comprenez l'implicite, vous défendez un point de vue et vous écrivez un texte "
      + "construit. C'est le niveau demandé pour la demande de naturalisation.",
    code: "B2", fond: "#ECFDF5", bord: "#BBF7D0", encre: "#166534",
  },
};

/** Traduit un niveau stocké (A2 / B1 / B2 / « En deçà de A2 ») en français lisible. */
export function niveauLisible(niveau: string | null | undefined): NiveauLisible {
  const s = String(niveau ?? "").trim().toUpperCase();
  return TABLE[s] ?? SOUS_A2;
}
