// lib/inscriptions/regles.ts — Règles de conformité MYSTORY (inscriptions formation)
// Source de vérité unique : catalogue, décompositions de séances, délai d'accès, validations.

// Catalogue v6 (28/07/2026) : 4 OFFRES × formules. Barème = 150 € (examen inclus) + heures × taux
// dégressif (45 €/h ≤15h, 40 € de 18 à 27h, 35 € au-delà, 30 € pour 45h). Durées multiples de 3h.
export type Offre = "A2" | "B1" | "B2" | "INTENSIF";

export const OFFRES: { code: Offre; label: string; niveauVise: string }[] = [
  { code: "A2", label: "A2 — Français du quotidien et du travail (carte de séjour pluriannuelle)", niveauVise: "A2" },
  { code: "B1", label: "B1 — Autonomie professionnelle (carte de résident)", niveauVise: "B1" },
  { code: "B2", label: "B2 — Argumenter et évoluer (naturalisation)", niveauVise: "B2" },
  { code: "INTENSIF", label: "Intensif — Stratégies & examens blancs", niveauVise: "" },
];

export type CodeFormule =
  | "A2_12H" | "A2_24H" | "A2_36H"
  | "B1_9H" | "B1_21H" | "B1_33H" | "B1_45H"
  | "B2_15H" | "B2_27H" | "B2_39H"
  | "INT_6H" | "INT_18H" | "INT_30H";

export interface Formule {
  code: CodeFormule;
  offre: Offre;
  nomFormule: string;
  libelle: string;
  dureeHeures: number;
  prixEuros: number;
  /** Décomposition officielle : nb séances 3h + séance finale (durée en h, 0 = aucune) */
  seances3h: number;
  seanceFinaleHeures: 0 | 1 | 2;
  descriptionFinale: string;
}

const DESC = "Oral + simulation intégrés à la dernière séance";
function f(code: CodeFormule, offre: Offre, nom: string, h: number, prix: number): Formule {
  return { code, offre, nomFormule: nom, libelle: `${h} h – ${prix} €`, dureeHeures: h, prixEuros: prix, seances3h: h / 3, seanceFinaleHeures: 0, descriptionFinale: DESC };
}

// Prix v6 alignés sur le site + la table public.formules → dossiers conformes au gate CDC.
export const CATALOGUE: Record<CodeFormule, Formule> = {
  A2_12H: f("A2_12H", "A2", "Consolidation", 12, 690),
  A2_24H: f("A2_24H", "A2", "Standard", 24, 1110),
  A2_36H: f("A2_36H", "A2", "Renforcée", 36, 1410),
  B1_9H:  f("B1_9H", "B1", "Éclair", 9, 555),
  B1_21H: f("B1_21H", "B1", "Consolidation", 21, 990),
  B1_33H: f("B1_33H", "B1", "Standard", 33, 1305),
  B1_45H: f("B1_45H", "B1", "Complète", 45, 1500),
  B2_15H: f("B2_15H", "B2", "Consolidation", 15, 825),
  B2_27H: f("B2_27H", "B2", "Standard", 27, 1230),
  B2_39H: f("B2_39H", "B2", "Complète", 39, 1515),
  INT_6H:  f("INT_6H", "INTENSIF", "Express", 6, 420),
  INT_18H: f("INT_18H", "INTENSIF", "Complet", 18, 870),
  INT_30H: f("INT_30H", "INTENSIF", "Sérénité", 30, 1200),
};

/** Formules d'une offre (pour le sélecteur en cascade Offre → Formule). */
export function formulesDeLOffre(offre: Offre): Formule[] {
  return Object.values(CATALOGUE).filter((x) => x.offre === offre);
}

/** Retrouve la formule v6 correspondant à une durée (les durées sont uniques dans le catalogue).
 *  Sert à revalider un planning à partir des heures_prevues du dossier. */
export function formuleParHeures(heures: number): CodeFormule | null {
  return (Object.values(CATALOGUE).find((x) => x.dureeHeures === heures)?.code) ?? null;
}

export type Creneau = "MATIN" | "APRES_MIDI" | "FINALE_1H" | "FINALE_2H";

export const CRENEAUX: Record<Creneau, { libelle: string; heures: number; debut: string; fin: string }> = {
  MATIN:      { libelle: "Matin 9h30–12h30",  heures: 3, debut: "09:30", fin: "12:30" },
  APRES_MIDI: { libelle: "Après-midi 14h–17h", heures: 3, debut: "14:00", fin: "17:00" },
  FINALE_1H:  { libelle: "Séance finale (1h)", heures: 1, debut: "",      fin: "" },
  FINALE_2H:  { libelle: "Séance finale (2h)", heures: 2, debut: "",      fin: "" },
};

// ---------- Jours fériés France métropolitaine ----------
function paques(annee: number): Date {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}
function addJours(d: Date, n: number): Date { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; }
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function joursFeries(annee: number): Set<string> {
  const p = paques(annee);
  return new Set([
    `${annee}-01-01`, `${annee}-05-01`, `${annee}-05-08`, `${annee}-07-14`,
    `${annee}-08-15`, `${annee}-11-01`, `${annee}-11-11`, `${annee}-12-25`,
    iso(addJours(p, 1)),  // Lundi de Pâques
    iso(addJours(p, 39)), // Ascension
    iso(addJours(p, 50)), // Lundi de Pentecôte
  ]);
}

/** Jour ouvré = lundi→vendredi hors jours fériés français. */
export function estJourOuvre(d: Date): boolean {
  const js = d.getUTCDay();
  if (js === 0 || js === 6) return false;
  return !joursFeries(d.getUTCFullYear()).has(iso(d));
}

/** Nb de jours ouvrés strictement entre deux dates (bornes exclues). */
export function joursOuvresEntre(debut: Date, fin: Date): number {
  let n = 0, cur = addJours(debut, 1);
  while (cur < fin) { if (estJourOuvre(cur)) n++; cur = addJours(cur, 1); }
  return n;
}

export const DELAI_ACCES_JOURS_OUVRES = 11;

// ---------- Validations ----------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const TEL_FR_RE = /^(?:\+33|0033|0)[1-9](?:[\s.\-]?\d{2}){4}$/;

export interface InscriptionInput {
  nom: string; prenom: string; email: string; telephone: string;
  certification: "TEF_IRN" | "LEVELTEL";
  financement: "CPF" | "OPCO" | "PoleEmploi" | "Perso"; // valeurs exactes du CHECK Supabase
  numeroEdof?: string | null;
  formule: CodeFormule;
  agenceInscription: "GAGNY" | "SARCELLES" | "ROSNY";
  niveauVise: "A1" | "A2" | "B1" | "B2";
  dateCommandeValidee?: string | null; // ISO — validation commande EDOF (CPF)
}

export interface SeanceInput {
  date: string;
  creneau: Creneau;
  /** Obligatoire pour les séances finales : sur quel créneau normal elle a lieu */
  demiJournee?: "MATIN" | "APRES_MIDI";
}

/** Horaires réels des séances finales (option 1 : dernières heures du créneau).
 *  Utilisé par l'émargement et l'Annexe 3 — jamais d'horaire 3h pour une séance d'1h. */
export const HORAIRES_FINALES = {
  FINALE_1H: { MATIN: { debut: "11:30", fin: "12:30" }, APRES_MIDI: { debut: "16:00", fin: "17:00" } },
  FINALE_2H: { MATIN: { debut: "10:30", fin: "12:30" }, APRES_MIDI: { debut: "15:00", fin: "17:00" } },
} as const;

export interface Verdict { ok: boolean; erreurs: string[]; avertissements: string[]; }

export function validerInscription(i: InscriptionInput): Verdict {
  const erreurs: string[] = [], avertissements: string[] = [];
  if (!i.nom?.trim()) erreurs.push("NOM obligatoire.");
  if (!i.prenom?.trim()) erreurs.push("Prénom obligatoire.");
  if (!EMAIL_RE.test(i.email?.trim() ?? "")) erreurs.push("Email invalide.");
  if (!TEL_FR_RE.test((i.telephone ?? "").trim()))
    erreurs.push("Téléphone invalide (format FR attendu, ex. 06 12 34 56 78).");
  if (!CATALOGUE[i.formule]) erreurs.push("Formule inconnue.");
  if (i.financement === "CPF") {
    // EDOF facultatif À LA SAISIE (complété ensuite par Lana via l'import EDOF).
    // Le gate de conformité (lib/gates.ts) ré-exige numero_edof ET date_validation_commande
    // AVANT toute génération/envoi de document officiel : la saisie passe, le document non.
    if (!i.numeroEdof?.trim())
      avertissements.push("N° dossier EDOF non renseigné — à compléter par Lana (import EDOF) avant la génération des documents officiels.");
    if (!i.dateCommandeValidee)
      avertissements.push("Date de validation de la commande EDOF non renseignée — à compléter via l'import EDOF ; le délai de 11 j ouvrés sera vérifié avant les documents officiels.");
  }
  return { ok: erreurs.length === 0, erreurs, avertissements };
}

export function validerPlanning(formule: CodeFormule, seances: SeanceInput[], dateCommandeValidee?: string | null): Verdict {
  const erreurs: string[] = [], avertissements: string[] = [];
  const f = CATALOGUE[formule];
  if (!f) return { ok: false, erreurs: ["Formule inconnue."], avertissements };
  if (seances.length === 0) return { ok: false, erreurs: ["Aucune séance planifiée."], avertissements };

  const total = seances.reduce((s, x) => s + (CRENEAUX[x.creneau]?.heures ?? 0), 0);
  if (total !== f.dureeHeures)
    erreurs.push(`Total planifié ${total}h ≠ durée vendue ${f.dureeHeures}h. Le plan doit tomber juste, à l'heure près.`);

  const finales = seances.filter(s => s.creneau === "FINALE_1H" || s.creneau === "FINALE_2H");
  if (f.seanceFinaleHeures === 0 && finales.length > 0)
    erreurs.push("La formule 6h n'a pas de séance finale séparée (oral intégré au dernier cours).");
  if (f.seanceFinaleHeures > 0) {
    const attendue: Creneau = f.seanceFinaleHeures === 1 ? "FINALE_1H" : "FINALE_2H";
    if (finales.length !== 1 || finales[0].creneau !== attendue)
      erreurs.push(`La formule ${f.libelle} exige exactement 1 séance « ${CRENEAUX[attendue].libelle} ».`);
    else {
      const maxDate = seances.reduce((m, s) => (s.date > m ? s.date : m), "");
      if (finales[0].date !== maxDate) erreurs.push("La séance finale doit être la dernière séance du planning.");
      if (!finales[0].demiJournee) erreurs.push("Préciser si la séance finale a lieu sur le créneau du matin ou de l'après-midi.");
    }
  }

  const dates = seances.map(s => s.date).sort();
  const doublons = dates.filter((d, ix) => ix > 0 && d === dates[ix - 1] &&
    seances.filter(s => s.date === d).length > seances.filter(s => s.date === d).map(s => s.creneau).filter((c, j, a) => a.indexOf(c) === j).length);
  if (new Set(seances.map(s => `${s.date}|${s.creneau}`)).size !== seances.length)
    erreurs.push("Deux séances identiques (même date + même créneau).");

  if (dateCommandeValidee) {
    const premiere = new Date(dates[0] + "T00:00:00Z");
    const commande = new Date(dateCommandeValidee + "T00:00:00Z");
    const jo = joursOuvresEntre(commande, premiere);
    if (jo < DELAI_ACCES_JOURS_OUVRES)
      erreurs.push(`Délai d'accès insuffisant : ${jo} jours ouvrés entre la validation de la commande (${dateCommandeValidee}) et la 1re séance (${dates[0]}). Minimum requis : ${DELAI_ACCES_JOURS_OUVRES}.`);
  }
  return { ok: erreurs.length === 0, erreurs, avertissements };
}

/** Génère automatiquement un plan conforme : 2 séances/sem. (à adapter dans l'UI). */
export function proposerPlanning(formule: CodeFormule, premiereSeance: string, creneau: "MATIN" | "APRES_MIDI", joursSemaine: number[] = [2, 6]): SeanceInput[] {
  const f = CATALOGUE[formule];
  const out: SeanceInput[] = [];
  let d = new Date(premiereSeance + "T00:00:00Z");
  let restantes3h = f.seances3h;
  while (restantes3h > 0) {
    if (joursSemaine.includes(d.getUTCDay())) { out.push({ date: iso(d), creneau }); restantes3h--; }
    d = addJours(d, 1);
  }
  if (f.seanceFinaleHeures > 0) {
    while (!joursSemaine.includes(d.getUTCDay())) d = addJours(d, 1);
    out.push({ date: iso(d), creneau: f.seanceFinaleHeures === 1 ? "FINALE_1H" : "FINALE_2H", demiJournee: creneau });
  }
  return out;
}
