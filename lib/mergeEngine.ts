/**
 * MYSTORY — Moteur de fusion balise → champ → HTML  (Brique 2A, branché Phase 2)
 * --------------------------------------------------------------
 * Remplit un template HTML v3 à balises {{...}} à partir d'une fiche stagiaire.
 *
 * Conformité câblée ici :
 *  - {{date_signature}} = TOUJOURS la date du jour (anti-antidate).
 *  - Lieu de formation ET {{lieu_signature}} = TOUJOURS Gagny (seul site Qualiopi),
 *    jamais fiche.agence (qui reste une donnée interne d'inscription).
 *  - {{duree_heures}} = heures PRÉVUES (contractualisation) ou RÉALISÉES (pièces de fin).
 *  - LEVELTEL : {{niveau_cecrl}} et {{numero_session}} neutralisés.
 *  - Balise requise non résolue → collectée dans `missing[]` + rendue «[À COMPLÉTER]».
 *  - Les tags de signature DocuSeal {{Signature ...;role=...;type=signature}} sont laissés
 *    intacts (ils ne matchent pas la regex des balises simples).
 */

import { readFileSync } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------
export type Certif = "TEF_IRN" | "LEVELTEL";
export type Site = "Gagny" | "Sarcelles" | "Rosny";
export type DurationSource = "prevues" | "realisees";

export interface FicheStagiaire {
  civilite: string;
  nom: string;
  prenom: string;
  dateNaissance?: string;
  villeNaissance?: string;
  adresse?: string;
  cp?: string;
  ville?: string;
  email?: string;
  telephone?: string;
  numeroDossier?: string;
  sessionEdof?: string;
  formatrice?: string;
  niveauAtteint?: string;
  heuresPrevues?: number;
  heuresRealisees?: number;
  dateDebut?: string;
  dateFin?: string;
  montant?: number;
  agence: Site;
  certif: Certif;
  planning?: Array<{ date?: string; demiJournee?: string; heures: number }>;
}

export interface TemplateConfig {
  id: string;
  durationSource: DurationSource;
  required: string[];
}

export interface MergeResult {
  html: string;
  missing: string[];
  certif: Certif;
}

// ---------------------------------------------------------------------------
// 2. Référentiels
// ---------------------------------------------------------------------------
const SITES: Record<Site, { ville: string; adresse: string; acces: string }> = {
  Gagny:     { ville: "Gagny",            adresse: "3 bis av. de Gagny, 93220 Gagny",                     acces: "RER E · parking · accès PMR" },
  Sarcelles: { ville: "Sarcelles",        adresse: "18 av. du 8 Mai 1945, 95200 Sarcelles",              acces: "RER D · bus · accès PMR" },
  Rosny:     { ville: "Rosny-sous-Bois",  adresse: "46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois", acces: "RER E · tram T1 · accès PMR" },
};

/** Seul site référencé Qualiopi (formation + examen). Lieu de formation = TOUJOURS Gagny. */
const SITE_FORMATION: Site = "Gagny";

const CERTIFS: Record<Certif, { intitule: string; code: string }> = {
  TEF_IRN:  { intitule: "Préparation au TEF — Test d'Évaluation de Français (Intégration · Résidence · Nationalité)", code: "RS6775" },
  LEVELTEL: { intitule: "Communiquer en français dans un contexte professionnel — LEVELTEL FLE",                      code: "RS6427" },
};

const NEUTRALISEES: Record<Certif, string[]> = {
  TEF_IRN:  [],
  LEVELTEL: ["niveau_cecrl", "numero_session"],
};

// ---------------------------------------------------------------------------
// 3. Formatage (FR)
// ---------------------------------------------------------------------------
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

export function formatDateFR(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatEuro(n?: number): string | null {
  if (n === undefined || n === null) return null;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

/** Heures lisibles : 6 -> « 6 h », 3.5 -> « 3,5 h ». */
export function formatHeures(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${s} h`;
}

/** Créneaux standard MYSTORY par demi-journée. */
const HORAIRES: Record<string, string> = {
  matin: "9h30 – 12h30",
  apres_midi: "14h – 17h",
};

/**
 * Construit les lignes <tr> de l'Annexe 3 (Planning) à partir des séances du dossier.
 * HTML BRUT (injecté via le marqueur <!--PLANNING_ROWS-->), donc PAS passé dans escapeHtml :
 * les valeurs sont contrôlées (dates formatées, énum demi-journée, nombres) — aucun texte libre.
 * Le total des heures = Σ séances = durée contractuelle (source unique).
 */
export function buildPlanningRows(planning?: FicheStagiaire["planning"]): string {
  if (!planning || planning.length === 0) {
    return `<tr><td colspan="5" style="text-align:center;color:#7a8290;padding:10px">Planning des séances en cours de finalisation.</td></tr>`;
  }
  const sorted = [...planning].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const box = (on: boolean) => (on ? "☑" : "☐");
  return sorted
    .map((s) => {
      const matin = s.demiJournee === "matin";
      const aprem = s.demiJournee === "apres_midi";
      const horaire = HORAIRES[s.demiJournee ?? ""] ?? "—";
      return (
        `<tr>` +
        `<td>${formatDateFR(s.date) ?? "—"}</td>` +
        `<td style="text-align:center">${box(matin)}</td>` +
        `<td style="text-align:center">${box(aprem)}</td>` +
        `<td>${horaire}</td>` +
        `<td style="text-align:center">${formatHeures(s.heures)}</td>` +
        `</tr>`
      );
    })
    .join("");
}

/**
 * Lignes <tr> de la feuille d'émargement (une par demi-journée planifiée).
 * Colonnes : Date · Demi-journée (créneau + horaire) · Signature stagiaire (vide) · Signature formateur (vide).
 * Signées à la main sur place, le jour même. HTML brut (valeurs contrôlées).
 */
export function buildEmargementRows(planning?: FicheStagiaire["planning"]): string {
  if (!planning || planning.length === 0) {
    return `<tr><td colspan="4" style="text-align:center;color:#7a8290;padding:10px">Planning des séances en cours de finalisation.</td></tr>`;
  }
  const sorted = [...planning].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const LABEL: Record<string, string> = { matin: "Matin", apres_midi: "Après-midi" };
  return sorted
    .map((s) => {
      const creneau = LABEL[s.demiJournee ?? ""] ?? "—";
      const horaire = HORAIRES[s.demiJournee ?? ""] ?? "—";
      return (
        `<tr style="height:54px">` +
        `<td>${formatDateFR(s.date) ?? "—"}</td>` +
        `<td>${creneau} <span style="color:#7a8290">(${horaire})</span></td>` +
        `<td class="sig"></td>` +
        `<td class="sig"></td>` +
        `</tr>`
      );
    })
    .join("");
}
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return `${now.getDate()} ${MOIS[now.getMonth()]} ${now.getFullYear()}`;
}

export function computeDateFin(fiche: FicheStagiaire): string | null {
  if (fiche.dateFin) return formatDateFR(fiche.dateFin);
  return null;
}

// ---------------------------------------------------------------------------
// 4. Résolution des balises
// ---------------------------------------------------------------------------
function resolveBalises(fiche: FicheStagiaire, cfg: TemplateConfig): Record<string, string | null> {
  const heures = cfg.durationSource === "realisees" ? fiche.heuresRealisees : fiche.heuresPrevues;
  const site = SITES[SITE_FORMATION];   // Gagny forcé, jamais fiche.agence
  const certif = CERTIFS[fiche.certif];

  const adresseComplete =
    [fiche.adresse, [fiche.cp, fiche.ville].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ") || null;

  return {
    civilite:         fiche.civilite ?? null,
    nom:              fiche.nom ?? null,
    prenom:           fiche.prenom ?? null,
    date_naissance:   formatDateFR(fiche.dateNaissance),
    lieu_naissance:   fiche.villeNaissance ?? null,
    adresse_complete: adresseComplete,
    email:            fiche.email ?? null,
    telephone:        fiche.telephone ?? null,
    numero_dossier:   fiche.numeroDossier ?? null,
    numero_session:   fiche.sessionEdof ?? null,
    formateur:        fiche.formatrice ?? null,
    niveau_cecrl:     fiche.niveauAtteint ?? null,
    duree_heures:     heures !== undefined && heures !== null ? String(heures) : null,
    nb_seances:       fiche.planning && fiche.planning.length > 0 ? String(fiche.planning.length) : null,
    date_debut:       formatDateFR(fiche.dateDebut),
    date_fin:         computeDateFin(fiche),
    montant:          formatEuro(fiche.montant),
    certif_intitule:  certif.intitule,
    certif_code:      certif.code,
    site_adresse:     site.adresse,
    site_acces:       site.acces,
    // CALCULÉS / FORCÉS :
    date_signature:   todayParisFR(),
    lieu_signature:   site.ville,        // « Fait à Gagny »
    // PRÉ-SIGNATURE OF (option A) — images statiques optionnelles, pilotées par variables d'env.
    // Référencées uniquement dans des blocs {{#if ...}} du template → absentes = rien ne casse.
    of_signature_img: process.env.MYSTORY_OF_SIGNATURE_URL ?? null,
    cachet_img:       process.env.MYSTORY_CACHET_URL ?? null,
    cachet_absent:    process.env.MYSTORY_CACHET_URL ? null : "1",  // fallback cachet dessiné
  };
}

// ---------------------------------------------------------------------------
// 5. Moteur de rendu
// ---------------------------------------------------------------------------
export function merge(template: string, fiche: FicheStagiaire, cfg: TemplateConfig): MergeResult {
  const values = resolveBalises(fiche, cfg);
  const neutralisees = new Set(NEUTRALISEES[fiche.certif]);
  for (const key of neutralisees) values[key] = "";

  const certif = CERTIFS[fiche.certif];
  const site = SITES[SITE_FORMATION];
  let html = template
    .replace(/__FORMATION_INTITULE__/g, certif.intitule)
    .replace(/__FORMATION_CODE__/g, certif.code)
    .replace(/__SITE_ADRESSE__/g, site.adresse)
    .replace(/__SITE_ACCES__/g, site.acces);

  // Annexe 3 — Planning : injection HTML brute (avant l'échappement des {{...}}).
  html = html.split("<!--PLANNING_ROWS-->").join(buildPlanningRows(fiche.planning));

  // Feuille d'émargement : lignes par demi-journée (signatures vides).
  html = html.split("<!--EMARGEMENT_ROWS-->").join(buildEmargementRows(fiche.planning));

  // Sections conditionnelles {{#if balise}}...{{/if}}
  html = html.replace(/\{\{#if\s+([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key, body) => {
    const v = values[key];
    const keep = v !== null && v !== "" && !neutralisees.has(key);
    return keep ? body : "";
  });

  // Balises simples {{cle}} ([a-z_]+ uniquement → les tags DocuSeal restent intacts)
  const missing: string[] = [];
  html = html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key) => {
    const v = values[key];
    if (v === undefined) return _m;
    if (v === null) {
      if (cfg.required.includes(key)) missing.push(key);
      return "[À COMPLÉTER]";
    }
    return escapeHtml(v);
  });

  return { html, missing, certif: fiche.certif };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// 6. Catalogue des templates
// ---------------------------------------------------------------------------
export const TEMPLATES: Record<string, TemplateConfig> = {
  convocation: {
    id: "convocation",
    durationSource: "prevues",
    required: ["civilite", "nom", "prenom", "email", "telephone", "duree_heures", "date_debut", "date_fin", "formateur"],
  },
  convention: {
    id: "convention",
    durationSource: "prevues",
    required: ["civilite", "nom", "prenom", "adresse_complete", "numero_dossier", "duree_heures", "date_debut", "date_fin", "montant"],
  },
  emargement: {
    id: "emargement",
    durationSource: "prevues",
    required: ["civilite", "nom", "prenom", "formateur", "date_debut", "date_fin", "duree_heures"],
  },
};

// ---------------------------------------------------------------------------
// 7. Raccourci : charge le gabarit HTML par id et fusionne
// ---------------------------------------------------------------------------
export function mergeTemplate(templateId: string, fiche: FicheStagiaire): MergeResult {
  const cfg = TEMPLATES[templateId];
  if (!cfg) throw new Error(`Template inconnu : ${templateId}`);
  const file = path.join(process.cwd(), "templates", `${templateId}.html`);
  const tpl = readFileSync(file, "utf8");
  return merge(tpl, fiche, cfg);
}
