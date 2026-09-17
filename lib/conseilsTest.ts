/**
 * MYSTORY — Conseil personnalisé après le test de positionnement.
 *
 * 17/09/2026 — RÉÉCRIT. Ce fichier vendait encore les formules « Express 6 h,
 * Essentiel 18 h, Confort 30 h, Réussite 42 h », supprimées du catalogue le
 * 09/09 sur mise en demeure de la Caisse des dépôts. Chaque candidat qui
 * terminait son test recevait donc, par e-mail, une recommandation pour une
 * formule qui n'existe plus et qu'aucun conseiller ne pouvait lui vendre.
 *
 * Le catalogue déposé ne comporte plus que TROIS offres, une par niveau visé —
 * A2, B1, B2 — publiées à leur durée maximale de 36 h (1 620 €). Le volume
 * réellement facturé est arrêté après le test : 180 € + 40 € par heure.
 *
 * Le calcul des heures n'est pas refait ici : il vient de `heuresRecommandees`,
 * qui sert déjà à l'écran de fin de test. Deux calculs, ce seraient deux
 * réponses différentes pour le même candidat — celle de l'écran et celle du mail.
 */
import { heuresRecommandees, type Palier } from "@/lib/tests";

const DEMARCHE: Record<string, string> = {
  A2: "carte de séjour pluriannuelle",
  B1: "carte de résident",
  B2: "naturalisation",
};

export type ConseilTest = {
  /** Le nom de l'offre au catalogue, ex. « Parcours B1 ». */
  formule: string;
  heures: number;
  /** Phrase de synthèse (e-mail + encart CRM), sans HTML. */
  message: string;
  /** Écart de paliers entre le niveau visé et le niveau constaté, null si pas d'objectif. */
  ecart: number | null;
};

const PALIERS: Palier[] = ["A2", "B1", "B2"];

/** Le niveau constaté, ramené à un palier du catalogue. « En deçà de A2 » → null. */
function palier(v: string | null | undefined): Palier | null {
  const s = String(v ?? "").trim().toUpperCase();
  return (PALIERS as string[]).includes(s) ? (s as Palier) : null;
}

/** Prix TTC d'un parcours : 180 € pour le passage du TEF IRN + 40 € par heure. */
function prix(heures: number): number {
  return 180 + heures * 40;
}

const eur = (n: number) => (n >= 1000 ? `${Math.floor(n / 1000)} ${String(n % 1000).padStart(3, "0")}` : String(n));

export function conseilTest(
  niveauAtteint: string | null | undefined,
  niveauVise: string | null | undefined,
): ConseilTest {
  const constate = palier(niveauAtteint);
  const vise = palier(niveauVise);

  // Aucun objectif exprimé : on ne devine pas la démarche du candidat, c'est elle
  // qui détermine le niveau à atteindre. On l'oriente vers le conseiller.
  if (!vise) {
    const h = constate ? 12 : 36;
    return {
      formule: constate ? `Parcours ${constate}` : "Parcours A2",
      heures: h,
      ecart: null,
      message:
        `Votre niveau actuel est ${constate ?? "en cours de consolidation, en dessous de A2"}. ` +
        "Le nombre d'heures dépend de votre démarche : carte de séjour pluriannuelle (A2), " +
        "carte de résident (B1) ou naturalisation (B2). Dites-nous laquelle vous concerne et " +
        "nous arrêtons le volume exact avec vous.",
    };
  }

  const r = heuresRecommandees(constate, vise);
  const objectif = `${vise} (${DEMARCHE[vise]})`;
  const offre = `Parcours ${r.prochain === "A1" ? "A2" : r.prochain}`;
  const tarif = `${eur(prix(r.heures))} €`;

  // Le niveau visé est déjà tenu en compréhension : il reste l'examen à sécuriser.
  if (r.etapes === 0) {
    return {
      formule: offre, heures: r.heures, ecart: 0,
      message:
        `Bonne nouvelle : votre niveau tient déjà le palier ${objectif}. ` +
        `Nous recommandons ${r.heures} heures (${tarif}, passage du TEF IRN compris) pour ` +
        "sécuriser le jour J : méthode des quatre épreuves, gestion du temps, et travail " +
        "sur l'expression écrite, qui est l'épreuve qui fait échouer le plus de candidats.",
    };
  }

  // Un seul palier à franchir : le cas standard.
  if (r.etapes === 1) {
    return {
      formule: offre, heures: r.heures, ecart: 1,
      message:
        `Il vous reste un palier à franchir pour atteindre ${objectif}. ` +
        `Nous recommandons notre ${offre}, jusqu'à ${r.heures} heures (${tarif}, passage du ` +
        "TEF IRN compris). Le volume exact est arrêté avec vous après ce test : vous ne " +
        "financez que les heures retenues.",
    };
  }

  // Plusieurs paliers : on ne vend QUE le premier, et on le dit. Promettre le
  // niveau final en une seule formation serait vendre un échec.
  return {
    formule: offre, heures: r.heures, ecart: r.etapes,
    message:
      `Votre objectif ${objectif} demande ${r.etapes} parcours successifs : on ne franchit ` +
      `qu'un palier à la fois. Ce premier parcours vous mène jusqu'à ${r.prochain} — notre ` +
      `${offre}, jusqu'à ${r.heures} heures (${tarif}, passage du TEF IRN compris). Vous ` +
      "repasserez ensuite le TEF IRN, puis nous verrons la suite ensemble.",
  };
}
