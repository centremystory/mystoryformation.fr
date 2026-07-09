/**
 * MYSTORY — Conseils personnalisés après le test de positionnement.
 * Règle métier validée par la Direction (09/07/2026) :
 * écart entre le niveau visé (démarche) et le niveau atteint → formule recommandée.
 *   à niveau (ou au-dessus)  → Express 6 h (consolidation avant l'examen)
 *   −1 niveau                → Essentiel 18 h
 *   −2 niveaux               → Confort 30 h
 *   −3 niveaux ou débutant   → Réussite 42 h
 * Démarches : A2 = carte de séjour pluriannuelle · B1 = carte de résident · B2 = naturalisation.
 */

const ORDRE = ["A0", "A1", "A2", "B1", "B2"] as const;
const DEMARCHE: Record<string, string> = {
  A2: "carte de séjour pluriannuelle",
  B1: "carte de résident",
  B2: "naturalisation",
};

export type ConseilTest = {
  formule: string;
  heures: number;
  /** Phrase de synthèse (email + encart CRM), sans HTML. */
  message: string;
  /** Écart de niveaux (visé − atteint), null si pas de niveau visé. */
  ecart: number | null;
};

function idx(niveau: string | null | undefined): number {
  const i = ORDRE.indexOf(String(niveau ?? "").toUpperCase() as (typeof ORDRE)[number]);
  return i < 0 ? -1 : i;
}

export function conseilTest(niveauAtteint: string | null | undefined, niveauVise: string | null | undefined): ConseilTest {
  const a = idx(niveauAtteint);
  const v = idx(niveauVise);
  const objectif = niveauVise && DEMARCHE[String(niveauVise).toUpperCase()]
    ? `${String(niveauVise).toUpperCase()} (${DEMARCHE[String(niveauVise).toUpperCase()]})`
    : niveauVise ? String(niveauVise).toUpperCase() : null;

  // Débutant complet : formule maximale quel que soit l'objectif.
  if (a <= 0) {
    return {
      formule: "Réussite", heures: 42, ecart: v >= 0 && a >= 0 ? v - a : null,
      message: objectif
        ? `Vous partez des bases : pour atteindre le niveau ${objectif}, nous recommandons la formule Réussite (42 h), le parcours complet pour progresser sereinement.`
        : "Vous partez des bases : nous recommandons la formule Réussite (42 h), le parcours complet pour progresser sereinement.",
    };
  }

  // Pas d'objectif exprimé : conseil générique selon le niveau atteint.
  if (v < 0) {
    return {
      formule: "Essentiel", heures: 18, ecart: null,
      message: `Votre niveau actuel est ${ORDRE[a]}. Selon votre projet (carte de séjour, carte de résident, naturalisation), nos conseillers vous orienteront vers la formule adaptée — la formule Essentiel (18 h) est un bon point de départ pour franchir un niveau.`,
    };
  }

  const ecart = v - a;
  if (ecart <= 0) {
    return {
      formule: "Express", heures: 6, ecart,
      message: `Bonne nouvelle : votre niveau actuel (${ORDRE[a]}) correspond déjà à votre objectif ${objectif}. La formule Express (6 h) vous prépare aux conditions réelles de l'examen pour le réussir du premier coup.`,
    };
  }
  if (ecart === 1) {
    return {
      formule: "Essentiel", heures: 18, ecart,
      message: `Il vous reste un niveau à franchir pour atteindre votre objectif ${objectif} (niveau actuel : ${ORDRE[a]}). La formule Essentiel (18 h) est conçue exactement pour cela.`,
    };
  }
  if (ecart === 2) {
    return {
      formule: "Confort", heures: 30, ecart,
      message: `Deux niveaux vous séparent de votre objectif ${objectif} (niveau actuel : ${ORDRE[a]}). La formule Confort (30 h) vous donne le rythme et l'accompagnement pour y arriver.`,
    };
  }
  return {
    formule: "Réussite", heures: 42, ecart,
    message: `Votre objectif ${objectif} demande une belle progression depuis votre niveau actuel (${ORDRE[a]}). La formule Réussite (42 h) est le parcours complet pour y parvenir pas à pas.`,
  };
}
