/**
 * MYSTORY — Moteur de tests (initial & final).
 * Correction CÔTÉ SERVEUR uniquement : les corrigés (bonne_reponse, mots_cles) ne quittent jamais la base.
 * Barème : chaque section (CE, CO) est ramenée sur /10 ; avec EE/10 + EO/10 → /40 → /20 → niveau CECRL.
 */

export type SectionTest = "CE" | "CO";

export type QuestionCorrige = {
  id: string;
  section: SectionTest;
  type: "choix_unique" | "texte_libre";
  bonne_reponse: string | null;
  mots_cles: string[] | null;
  points: number;
};

/** Niveau CECRL à partir d'une note /20 (barème MYSTORY, identique test initial et final). */
export function niveauFromSur20(n: number): string {
  if (n <= 4) return "A0";
  if (n <= 9) return "A1";
  if (n <= 14) return "A2";
  if (n <= 18) return "B1";
  return "B2";
}

/** Réponse libre : vrai si un mot-clé est retrouvé (avec et sans espaces, insensible à la casse). */
export function texteLibreOk(reponse: string | null | undefined, motsCles: string[] | null | undefined): boolean {
  if (!motsCles || motsCles.length === 0) return false;
  const v = String(reponse ?? "").toLowerCase().trim();
  if (!v) return false;
  const vSansEspace = v.replace(/\s+/g, "");
  return motsCles.some((k) => {
    const kk = String(k).toLowerCase().trim();
    if (!kk) return false;
    return v.includes(kk) || vSansEspace.includes(kk.replace(/\s+/g, ""));
  });
}

/** Corrige les sections auto (CE, CO) à partir des réponses du candidat. Renvoie les scores ramenés sur /10. */
export function corrigerAuto(
  questions: QuestionCorrige[],
  reponses: Record<string, string>,
): { ceSur10: number; coSur10: number; cePts: number; ceMax: number; coPts: number; coMax: number } {
  let cePts = 0, ceMax = 0, coPts = 0, coMax = 0;
  for (const q of questions) {
    const max = q.points ?? 1;
    if (q.section === "CE") ceMax += max; else coMax += max;
    const rep = reponses?.[q.id];
    const ok = q.type === "texte_libre"
      ? texteLibreOk(rep, q.mots_cles)
      : rep != null && String(rep) === q.bonne_reponse;
    if (ok) { if (q.section === "CE") cePts += max; else coPts += max; }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    ceSur10: ceMax ? r1((cePts / ceMax) * 10) : 0,
    coSur10: coMax ? r1((coPts / coMax) * 10) : 0,
    cePts, ceMax, coPts, coMax,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CALIBRAGE PAR PALIER — 08/09/2026
 *
 * Le barème historique (corrigerAuto) est un pourcentage : bon pour dire « il a
 * eu 7/10 », inutilisable pour situer un niveau dès qu'on mélange des questions
 * faciles et difficiles. En ajoutant des items B1/B2 au test initial, un candidat
 * A2 voyait mécaniquement son pourcentage chuter et se retrouvait classé A1 —
 * on lui aurait vendu une formule trop longue.
 *
 * Ici on ne compte plus le pourcentage global : on regarde JUSQU'OÙ le candidat
 * tient. C'est le principe du TEF IRN lui-même, qui est adaptatif et attribue le
 * niveau par seuil et non par moyenne.
 *
 * Le résultat est exprimé en HEURES et non en nom de formule : le même test peut
 * ainsi servir à plusieurs organismes, chacun projetant ces heures sur sa grille.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Palier = "A2" | "B1" | "B2";
export const PALIERS: Palier[] = ["A2", "B1", "B2"];

/** Un palier est tenu si le candidat y réussit au moins 60 % des points. */
export const SEUIL_PALIER = 0.6;

export type QuestionCalibree = QuestionCorrige & { niveau?: string | null };

export type ResultatPalier = {
  palier: Palier;
  points: number;
  max: number;
  taux: number;
  tenu: boolean;
};

/**
 * Niveau atteint = le palier le plus haut tenu, à condition que tous les paliers
 * en dessous le soient aussi. Un candidat qui réussirait le B2 sans tenir le B1
 * n'est pas B2 : c'est presque toujours le signe d'un hasard sur peu d'items.
 * Renvoie null quand même l'A2 n'est pas tenu (le candidat est en dessous).
 */
export function niveauAtteint(paliers: ResultatPalier[]): Palier | null {
  let atteint: Palier | null = null;
  for (const p of PALIERS) {
    const r = paliers.find((x) => x.palier === p);
    if (!r || r.max === 0) continue;   // palier non évalué : on ne tranche pas dessus
    if (!r.tenu) break;                // dès qu'un palier lâche, on s'arrête
    atteint = p;
  }
  return atteint;
}

/** Détaille la réussite palier par palier, toutes sections confondues. */
export function calibrer(
  questions: QuestionCalibree[],
  reponses: Record<string, string>,
): { paliers: ResultatPalier[]; niveau: Palier | null } {
  const acc = new Map<Palier, { points: number; max: number }>();
  for (const p of PALIERS) acc.set(p, { points: 0, max: 0 });

  for (const q of questions) {
    const niv = (q.niveau ?? "A2") as Palier;
    const bucket = acc.get(niv);
    if (!bucket) continue;             // niveau inconnu ou hors échelle : ignoré
    const max = q.points ?? 1;
    bucket.max += max;
    const rep = reponses?.[q.id];
    const ok = q.type === "texte_libre"
      ? texteLibreOk(rep, q.mots_cles)
      : rep != null && String(rep) === q.bonne_reponse;
    if (ok) bucket.points += max;
  }

  const paliers: ResultatPalier[] = PALIERS.map((palier) => {
    const b = acc.get(palier)!;
    const taux = b.max ? b.points / b.max : 0;
    return { palier, points: b.points, max: b.max, taux, tenu: b.max > 0 && taux >= SEUIL_PALIER };
  });

  return { paliers, niveau: niveauAtteint(paliers) };
}

/**
 * Heures recommandées à partir de l'écart entre le niveau constaté et le niveau
 * visé par la démarche administrative du candidat.
 *
 * Le volume ne dépend QUE de l'écart : un candidat qui doit franchir deux niveaux
 * a besoin de plus d'heures qu'un candidat qui en franchit un, quel que soit le
 * niveau de départ. On ne descend jamais sous 12 h (plancher exigé pour un dépôt
 * EDOF) et on ne dépasse jamais 45 h.
 */
/** L'echelle reelle : « sous A2 » n'est pas un niveau vise, c'est un point de depart. */
const ECHELLE = ["A1", "A2", "B1", "B2"] as const;

/**
 * Le volume d'heures a recommander, et surtout LE NIVEAU A VISER.
 *
 * 09/09/2026 — corrige apres un test reel d'Arudhan : en ne repondant a AUCUNE
 * question, il s'est vu proposer « 45 h pour atteindre le B2 ». Deux fautes.
 *
 *   1. 45 h n'existe plus. Le catalogue plafonne a 36 h depuis la mise en demeure
 *      de la Caisse des depots du 09/09 : recommander un volume non finançable est
 *      une information trompeuse sur les conditions de financement (art. 7.2 CG).
 *
 *   2. Surtout : on ne franchit qu'UN SEUL palier a la fois. A1 vers A2, A2 vers B1,
 *      B1 vers B2 — jamais A1 vers B2. Le TEF IRN est un examen unique, et le
 *      plafond de prise en charge ne finance pas deux paliers. Promettre le B2 a un
 *      debutant, c'est vendre un echec : il paie, il echoue, il revient furieux.
 *
 * On renvoie donc le PROCHAIN palier atteignable, pas celui dont le candidat reve,
 * et le nombre d'etapes qui le separent de son objectif.
 */
export function heuresRecommandees(
  constate: Palier | null,
  vise: Palier,
): { heures: number; ecart: number; motif: string; prochain: string; etapes: number } {
  // « sous A2 » = A1 : c'est la ou l'on part, pas ce que l'on vise.
  const depart = constate === null ? "A1" : constate;
  const iDepart = ECHELLE.indexOf(depart as any);
  const iVise = Math.max(iDepart, ECHELLE.indexOf(vise as any));

  // Le prochain palier : un cran au-dessus, jamais deux.
  const iProchain = Math.min(iDepart + 1, ECHELLE.length - 1);
  const prochain = ECHELLE[iProchain];
  const etapes = Math.max(0, iVise - iDepart);

  // Deja au niveau vise : il reste l'examen a securiser.
  if (etapes === 0) {
    return {
      heures: 12, ecart: 0, prochain: depart, etapes: 0,
      motif: "Le niveau visé est déjà tenu. Les heures servent à sécuriser le jour de l'examen : "
           + "méthode des quatre épreuves, gestion du temps, entraînement à l'écrit et à l'oral.",
    };
  }

  // Un seul palier a franchir : c'est le cas standard.
  if (etapes === 1) {
    return {
      heures: 36, ecart: 1, prochain, etapes: 1,
      motif: `Un palier à franchir, de ${depart} vers ${prochain}. C'est le parcours complet, `
           + "avec un travail renforcé sur l'épreuve la plus faible.",
    };
  }

  // Plusieurs paliers : on ne vend QUE le premier, et on le dit.
  return {
    heures: 36, ecart: etapes, prochain, etapes,
    motif: `Votre objectif ${vise} demande ${etapes} parcours successifs. On ne franchit qu'un `
         + `palier à la fois : ce premier parcours vous mène de ${depart} à ${prochain}. `
         + `Vous repasserez ensuite le TEF IRN, puis nous verrons la suite. Promettre `
         + `${vise} en une seule formation serait vous vendre un échec.`,
  };
}


/**
 * Une seule épreuve faible fait tomber le niveau au TEF IRN (il faut tenir le
 * score dans les quatre à la fois). On signale donc l'épreuve décrochée, qui est
 * celle sur laquelle la formation doit porter en priorité.
 */
export function epreuveLaPlusFaible(
  ceSur10: number,
  coSur10: number,
  eeSur10: number | null,
  eoSur10: number | null,
): { epreuve: string; note: number } | null {
  const notes: Array<{ epreuve: string; note: number }> = [
    { epreuve: "compréhension écrite", note: ceSur10 },
    { epreuve: "compréhension orale", note: coSur10 },
  ];
  if (eeSur10 != null) notes.push({ epreuve: "expression écrite", note: eeSur10 });
  if (eoSur10 != null) notes.push({ epreuve: "expression orale", note: eoSur10 });
  notes.sort((a, b) => a.note - b.note);
  const pire = notes[0];
  const suivant = notes[1];
  // On ne signale que si l'écart est réel : sinon le profil est homogène.
  if (!suivant || suivant.note - pire.note < 1.5) return null;
  return pire;
}
