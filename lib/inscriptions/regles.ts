// lib/inscriptions/regles.ts — Règles de conformité MYSTORY (inscriptions formation)
// Source de vérité unique : catalogue, décompositions de séances, délai d'accès, validations.

// CATALOGUE TEF IRN — refondu le 17/09/2026 pour rejoindre le catalogue réellement
// déposé sur EDOF depuis le 09/09.
//
// Ce fichier portait encore la grille v6 : 4 offres × 3 formules, durées de 12 à
// 45 h, prix de 630 à 1 650 €, et un barème dégressif 40/35/25 €/h. Rien de tout
// cela n'existe plus.
//
// Ce que la mise en demeure de la Caisse des dépôts du 09/09 a imposé :
//   1. l'offre INTENSIF (multi-niveaux) est SUPPRIMÉE — elle ne se distinguait des
//      autres que par sa durée et par un niveau non fixé ;
//   2. il reste TROIS offres, une par niveau visé, chacune publiée à sa DURÉE
//      MAXIMALE : 36 h, 1 620 €.
//
// Le volume réellement suivi est arrêté APRÈS le test de positionnement et inscrit
// au dossier avec sa justification (CGU art. 5.1, commande « personnalisée ») : de
// 12 h — le plancher finançable — à 36 h, par pas de 3 h.
//
// Barème unique, sans palier : 180 € pour le passage du TEF IRN (inclus) + 40 €/h.
// 36 h = 180 + 1 440 = 1 620 €, dernier multiple de 3 qui tient sous le plafond.
// Plafond : 1 650 € = 1 500 € pris en charge par le CPF + 150 € de participation.
//
// ⚠️ La durée n'identifie PLUS l'offre : 24 h peut être A2, B1 ou B2. Tout ce qui
// déduisait l'offre d'une durée doit passer par le niveau visé du dossier.
export type Offre = "A2" | "B1" | "B2";

export const OFFRES: { code: Offre; label: string; niveauVise: string }[] = [
  { code: "A2", label: "A2 — Français du quotidien et du travail (carte de séjour pluriannuelle)", niveauVise: "A2" },
  { code: "B1", label: "B1 — Autonomie professionnelle (carte de résident)", niveauVise: "B1" },
  { code: "B2", label: "B2 — Argumenter et évoluer (naturalisation)", niveauVise: "B2" },
];

/** Volumes finançables : de 12 h (plancher CPF) à 36 h (durée publiée), par pas de 3 h. */
export const VOLUMES_CPF = [12, 15, 18, 21, 24, 27, 30, 33, 36] as const;

/** `A2_12H` … `B2_36H` — une entrée par offre et par volume finançable. */
export type CodeFormule = `${Offre}_${number}H`;

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

/** Plafonds et barème officiels — utilisés par les gates de conformité. */
export const PRIX_EXAMEN_INCLUS = 180;   // passage du TEF IRN, compris dans le parcours
export const TAUX_HORAIRE = 40;          // €/h — TAUX UNIQUE, sans palier depuis le 09/09
export const PLAFOND_CPF = 1500;
export const TICKET_MODERATEUR = 150;
export const PLAFOND_TOTAL = 1650;

/** Prix d'un parcours : 180 € (examen inclus) + 40 € par heure. Source unique du calcul. */
export function prixTheorique(heures: number): number {
  return PRIX_EXAMEN_INCLUS + heures * TAUX_HORAIRE;
}

const DESC = "Oral + simulation intégrés à la dernière séance";

/** Nom lisible d'un volume, pour le sélecteur : il ne promet plus une « formule ». */
function nomVolume(h: number): string {
  if (h <= 15) return "Parcours court";
  if (h <= 27) return "Parcours standard";
  return h === 36 ? "Parcours complet" : "Parcours renforcé";
}

function f(offre: Offre, h: number): Formule {
  const prix = prixTheorique(h);
  return {
    code: `${offre}_${h}H` as CodeFormule, offre, nomFormule: nomVolume(h),
    libelle: `${h} h – ${prix} €`, dureeHeures: h, prixEuros: prix,
    seances3h: h / 3, seanceFinaleHeures: 0, descriptionFinale: DESC,
  };
}

/**
 * Trois offres × neuf volumes. Le prix est CALCULÉ, jamais recopié : c'est ce qui
 * avait laissé la grille du CRM diverger du catalogue déposé pendant huit jours.
 */
export const CATALOGUE: Record<CodeFormule, Formule> = Object.fromEntries(
  (["A2", "B1", "B2"] as const).flatMap((o) => VOLUMES_CPF.map((h) => [`${o}_${h}H`, f(o, h)])),
) as Record<CodeFormule, Formule>;

/** Modules courts de méthodologie — HORS CPF (fonds propres / Lenbox uniquement).
 *  15/09/2026 : même barème que le catalogue CPF — 180 € + 40 €/h — pour qu'aucun
 *  écart ne laisse croire à un prix majoré au motif d'un financement CPF.
 *  Ne jamais publier sur EDOF : sous le plancher de 12 h, ce n'est pas finançable. */
export const MODULES_COURTS: { heures: number; prixEuros: number; nom: string }[] =
  [3, 6, 9].map((h) => ({
    heures: h, prixEuros: prixTheorique(h),
    nom: h === 3 ? "Prise en main" : h === 6 ? "Méthodologie" : "Méthodologie renforcée",
  }));

/** Formules d'une offre (pour le sélecteur en cascade Offre → Formule). */
export function formulesDeLOffre(offre: Offre): Formule[] {
  return Object.values(CATALOGUE).filter((x) => x.offre === offre);
}

/**
 * Retrouve une formule à partir d'une durée.
 *
 * ⚠️ 17/09/2026 — la durée n'identifie PLUS l'offre : 24 h existe pour A2, B1 et B2.
 * Sans `offre`, cette fonction renvoie la première correspondance, ce qui suffit
 * pour un calcul de PRIX (identique d'une offre à l'autre) mais jamais pour
 * déterminer le programme d'un dossier — passer par son niveau visé.
 */
export function formuleParHeures(heures: number, offre?: Offre): CodeFormule | null {
  const f = Object.values(CATALOGUE).find(
    (x) => x.dureeHeures === heures && (!offre || x.offre === offre),
  );
  return f?.code ?? null;
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
