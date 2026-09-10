/**
 * MYSTORY — Jours ouvrés.
 *
 * 10/09/2026 — la convention partenaire compte en JOURS OUVRÉS, « samedis,
 * dimanches et jours fériés non comptés » (article 6). Le portail, lui, comptait
 * en jours calendaires : les deux textes ne disaient donc pas la même chose, et
 * c'est le genre d'écart qu'un partenaire découvre le jour où on lui refuse une
 * inscription qu'il croyait dans les délais.
 *
 * Les fériés sont calculés, pas listés : une liste en dur périme au 1er janvier.
 * Pâques par la méthode de Meeus (algorithme grégorien), les autres en découlent.
 */

/** Dimanche de Pâques de l'année donnée (méthode de Meeus/Jones/Butcher). */
function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);      // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

const decale = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const cle = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const cacheFeries = new Map<number, Set<string>>();

/** Les onze fériés légaux français d'une année, en clés AAAA-MM-JJ. */
export function feries(annee: number): Set<string> {
  const dejaLa = cacheFeries.get(annee);
  if (dejaLa) return dejaLa;

  const p = paques(annee);
  const s = new Set<string>([
    cle(new Date(annee, 0, 1)),    // Jour de l'an
    cle(decale(p, 1)),             // Lundi de Pâques
    cle(new Date(annee, 4, 1)),    // Fête du Travail
    cle(new Date(annee, 4, 8)),    // Victoire 1945
    cle(decale(p, 39)),            // Ascension
    cle(decale(p, 50)),            // Lundi de Pentecôte
    cle(new Date(annee, 6, 14)),   // Fête nationale
    cle(new Date(annee, 7, 15)),   // Assomption
    cle(new Date(annee, 10, 1)),   // Toussaint
    cle(new Date(annee, 10, 11)),  // Armistice 1918
    cle(new Date(annee, 11, 25)),  // Noël
  ]);
  cacheFeries.set(annee, s);
  return s;
}

/** Un jour ouvré : ni samedi, ni dimanche, ni férié. */
export function estOuvre(d: Date): boolean {
  const j = d.getDay();
  if (j === 0 || j === 6) return false;
  return !feries(d.getFullYear()).has(cle(d));
}

/**
 * Nombre de jours ouvrés strictement entre aujourd'hui et une date d'examen.
 * Le jour même et le jour de l'examen ne sont pas comptés : c'est le délai
 * « il reste N jours ouvrés avant la session ».
 *
 * `iso` est une date AAAA-MM-JJ. On la construit en local pour éviter le décalage
 * d'un jour que produit new Date("2026-09-14") selon le fuseau.
 */
export function joursOuvresAvant(iso: string, depuis?: Date): number {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !j) return 0;
  const cible = new Date(a, m - 1, j);
  cible.setHours(0, 0, 0, 0);

  const debut = depuis ? new Date(depuis) : new Date();
  debut.setHours(0, 0, 0, 0);
  if (cible <= debut) return 0;

  let n = 0;
  const curseur = new Date(debut);
  curseur.setDate(curseur.getDate() + 1);        // on part de demain
  while (curseur < cible) {
    if (estOuvre(curseur)) n++;
    curseur.setDate(curseur.getDate() + 1);
  }
  return n;
}
