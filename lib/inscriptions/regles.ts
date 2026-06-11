// lib/inscriptions/regles.ts — Règles de conformité MYSTORY (inscriptions formation)
// Source de vérité unique : catalogue, décompositions de séances, délai d'accès, validations.

export type CodeFormule = "6H" | "16H" | "26H";

export interface Formule {
  code: CodeFormule;
  libelle: string;
  dureeHeures: number;
  prixEuros: number;
  /** Décomposition officielle : nb séances 3h + séance finale (durée en h, 0 = aucune) */
  seances3h: number;
  seanceFinaleHeures: 0 | 1 | 2;
  descriptionFinale: string;
}

export const CATALOGUE: Record<CodeFormule, Formule> = {
  "6H":  { code: "6H",  libelle: "6h – 450 €",   dureeHeures: 6,  prixEuros: 450,
           seances3h: 2, seanceFinaleHeures: 0,
           descriptionFinale: "Oral + simulation intégrés à la dernière heure du 2e cours" },
  "16H": { code: "16H", libelle: "16h – 950 €",  dureeHeures: 16, prixEuros: 950,
           seances3h: 5, seanceFinaleHeures: 1,
           descriptionFinale: "Séance finale 1h : oral + simulation d'examen" },
  "26H": { code: "26H", libelle: "26h – 1450 €", dureeHeures: 26, prixEuros: 1450,
           seances3h: 8, seanceFinaleHeures: 2,
           descriptionFinale: "Séance finale 2h : oral + bilan complet" },
};

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
  financement: "CPF" | "FONDS_PROPRES" | "OPCO" | "FRANCE_TRAVAIL";
  numeroEdof?: string | null;
  formule: CodeFormule;
  agenceInscription: "GAGNY" | "SARCELLES";
  niveauVise: "A1" | "A2" | "B1" | "B2";
  dateCommandeValidee?: string | null; // ISO — validation commande EDOF (CPF)
}

export interface SeanceInput { date: string; creneau: Creneau; }

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
    if (!i.numeroEdof?.trim()) erreurs.push("N° dossier EDOF obligatoire pour un financement CPF.");
    if (!i.dateCommandeValidee) erreurs.push("Date de validation de la commande EDOF obligatoire (CPF) — elle déclenche le contrôle du délai d'accès.");
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
    out.push({ date: iso(d), creneau: f.seanceFinaleHeures === 1 ? "FINALE_1H" : "FINALE_2H" });
  }
  return out;
}
