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
