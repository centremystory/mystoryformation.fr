/**
 * MYSTORY — Import EDOF (§7). Sens unique : EDOF alimente le CRM, jamais l'inverse.
 *
 * • L'historique EDOF est archivé dans `dossiers_edof` (hors flux Qualiopi vivant).
 * • Si un n° de dossier EDOF correspond à un dossier VIVANT (dossiers.numero_edof),
 *   on complète ses champs VIDES et on SIGNALE les écarts — jamais d'écrasement (CRM = vérité).
 * • Mode "dry_run" : analyse + rapport, AUCUNE écriture. Mode "apply" : écrit + journalise.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { journal } from "./examens";
import { genererEtEnvoyerDocFin } from "./documentsAuto";

// En-têtes exacts de l'export CDC (Export_<SIRET>_<date>.csv ; séparateur « ; »).
const COL = {
  numero: "NUMERO_DOSSIER", civilite: "CIVILITE", nom: "NOM", prenom: "PRENOM",
  naissance: "DATE_DE_NAISSANCE", courriel: "COURRIEL",
  telPort: "NUMERO_TELEPHONE_PORTABLE", telFixe: "NUMERO_TELEPHONE_FIXE",
  refRep: "REF_REPERTOIRE", codeCertif: "CODE_CERTIF/THEM", intituleCertif: "INTITULE_CERTIF/THEM",
  numFormation: "NUMERO_FORMATION", numAction: "NUMERO_ACTION", numSession: "NUMERO_SESSION",
  intituleFormation: "INTITULE_FORMATION", debut: "DATE_DEBUT_SESSION", fin: "DATE_FIN_SESSION",
  lieuVille: "LIEU_FORMATION_VILLE", statut: "STATUT_DOSSIER", derniereAction: "DATE_DERNIERE_ACTION",
  enControle: "EN_CONTROLE", abondementFt: "ABONDEMENT_FT", inscription: "DATE_INSCRIPTION",
  taux: "TAUX_REALISATION_SAISI", motif: "MOTIF_DE_SORTIE_FINAL",
  mtFormation: "MONTANT_FORMATION", mtFraisAnnexes: "MONTANT_FRAIS_ANNEXES",
  mtFacturable: "MONTANT_FACTURABLE", mtFacture: "MONTANT_FACTURE",
} as const;

// ---------------------------------------------------------------------------
// Parseur CSV (séparateur « ; », gestion des guillemets et retours ligne CRLF)
// ---------------------------------------------------------------------------
export function parseCsv(text: string, sep = ";"): Record<string, string>[] {
  const t = text.replace(/^\uFEFF/, ""); // BOM éventuel
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], dansGuillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = false;
      } else champ += c;
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ); champ = "";
    } else if (c === "\n") {
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else if (c === "\r") {
      // ignoré (CRLF)
    } else champ += c;
  }
  if (champ.length > 0 || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }
  if (lignes.length === 0) return [];
  const head = lignes[0].map((h) => h.trim());
  return lignes.slice(1)
    .filter((l) => l.some((v) => v.trim() !== ""))
    .map((l) => Object.fromEntries(head.map((h, i) => [h, (l[i] ?? "").trim()])));
}

// ---------------------------------------------------------------------------
// Parseurs de valeurs
// ---------------------------------------------------------------------------
function dateISO(v: string): string | null {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function num(v: string): number | null {
  if (v == null || v.trim() === "") return null;
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bool(v: string): boolean | null {
  const s = (v ?? "").trim().toUpperCase();
  if (s === "OUI") return true;
  if (s === "NON") return false;
  return null;
}
function anneeDe(iso: string | null): number | null {
  return iso ? Number(iso.slice(0, 4)) : null;
}

export interface EdofRecord {
  numero_dossier: string;
  civilite: string | null; nom: string | null; prenom: string | null; date_naissance: string | null;
  courriel: string | null; telephone: string | null;
  ref_repertoire: string | null; code_certif: string | null; intitule_certif: string | null;
  numero_formation: string | null; numero_action: string | null; numero_session: string | null;
  intitule_formation: string | null; date_debut: string | null; date_fin: string | null; lieu_ville: string | null;
  statut_dossier: string | null; date_derniere_action: string | null; en_controle: boolean | null;
  abondement_ft: string | null; date_inscription: string | null; taux_realisation: number | null; motif_sortie: string | null;
  montant_formation: number | null; montant_frais_annexes: number | null;
  montant_facturable: number | null; montant_facture: number | null;
  origine_fonds: string; annee: number | null; fichier: string | null;
}

function toRecord(r: Record<string, string>, fichier: string | null): EdofRecord | null {
  const numero = (r[COL.numero] ?? "").trim();
  if (!numero) return null;
  const debut = dateISO(r[COL.debut]);
  return {
    numero_dossier: numero,
    civilite: r[COL.civilite] || null, nom: r[COL.nom] || null, prenom: r[COL.prenom] || null,
    date_naissance: dateISO(r[COL.naissance]), courriel: r[COL.courriel] || null,
    telephone: (r[COL.telPort] || r[COL.telFixe] || null),
    ref_repertoire: r[COL.refRep] || null, code_certif: r[COL.codeCertif] || null, intitule_certif: r[COL.intituleCertif] || null,
    numero_formation: r[COL.numFormation] || null, numero_action: r[COL.numAction] || null, numero_session: r[COL.numSession] || null,
    intitule_formation: r[COL.intituleFormation] || null, date_debut: debut, date_fin: dateISO(r[COL.fin]), lieu_ville: r[COL.lieuVille] || null,
    statut_dossier: r[COL.statut] || null, date_derniere_action: dateISO(r[COL.derniereAction]), en_controle: bool(r[COL.enControle]),
    abondement_ft: r[COL.abondementFt] || null, date_inscription: dateISO(r[COL.inscription]),
    taux_realisation: num(r[COL.taux]), motif_sortie: r[COL.motif] || null,
    montant_formation: num(r[COL.mtFormation]), montant_frais_annexes: num(r[COL.mtFraisAnnexes]),
    montant_facturable: num(r[COL.mtFacturable]), montant_facture: num(r[COL.mtFacture]),
    origine_fonds: "CPF_CDC", annee: anneeDe(debut), fichier,
  };
}

// ---------------------------------------------------------------------------
// Import (dry-run / apply)
// ---------------------------------------------------------------------------
export interface RapportImport {
  total: number;
  crees: number;
  mis_a_jour: number;
  rapproches_live: number;
  services_fait_ouverts: number;
  conflits: Array<{ numero: string; champ: string; crm: string; edof: string }>;
  conflits_total: number;
  par_annee: Record<string, { dossiers: number; montant_facturable: number }>;
  par_statut: Record<string, number>;
  ignorees: number;
}

export async function importerEdof(
  csvText: string,
  opts: { mode: "dry_run" | "apply"; fichier?: string | null; auteur?: string | null },
): Promise<RapportImport> {
  const fichier = opts.fichier ?? null;
  const lignes = parseCsv(csvText);
  const records: EdofRecord[] = [];
  let ignorees = 0;
  for (const l of lignes) {
    const rec = toRecord(l, fichier);
    if (rec) records.push(rec); else ignorees++;
  }

  // Déjà archivés (pour distinguer créations / mises à jour) + dossiers vivants (réconciliation).
  const { data: dejaArchive } = await supabaseAdmin.from("dossiers_edof").select("numero_dossier");
  const setArchive = new Set((dejaArchive ?? []).map((d: any) => String(d.numero_dossier)));
  const { data: live } = await supabaseAdmin
    .from("dossiers").select("id, numero_edof, session_edof, date_debut, date_fin, montant, service_fait_valide, origine_fonds, financement");
  const liveParNum = new Map(
    (live ?? []).filter((d: any) => d.numero_edof).map((d: any) => [String(d.numero_edof), d]),
  );

  let crees = 0, majs = 0, rapprochesLive = 0, servicesFaitOuverts = 0;
  const conflits: RapportImport["conflits"] = [];
  const parAnnee: RapportImport["par_annee"] = {};
  const parStatut: RapportImport["par_statut"] = {};

  for (const r of records) {
    setArchive.has(r.numero_dossier) ? majs++ : crees++;
    const an = r.annee ? String(r.annee) : "?";
    parAnnee[an] = parAnnee[an] ?? { dossiers: 0, montant_facturable: 0 };
    parAnnee[an].dossiers++;
    parAnnee[an].montant_facturable += r.montant_facturable ?? 0;
    const st = r.statut_dossier ?? "?";
    parStatut[st] = (parStatut[st] ?? 0) + 1;

    const d = liveParNum.get(r.numero_dossier);
    if (d) {
      rapprochesLive++;
      const cmp: Array<[string, unknown, unknown]> = [
        ["date_debut", d.date_debut, r.date_debut],
        ["date_fin", d.date_fin, r.date_fin],
        ["montant", d.montant != null ? Number(d.montant) : null, r.montant_facturable],
      ];
      for (const [champ, crm, edof] of cmp) {
        if (crm != null && edof != null && String(crm) !== String(edof)) {
          conflits.push({ numero: r.numero_dossier, champ, crm: String(crm), edof: String(edof) });
        }
      }
    }
  }

  if (opts.mode === "apply") {
    // Archive : upsert idempotent par numéro de dossier (un ré-import met à jour, ne duplique pas).
    const TAILLE = 500;
    for (let i = 0; i < records.length; i += TAILLE) {
      const lot = records.slice(i, i + TAILLE);
      const { error } = await supabaseAdmin.from("dossiers_edof").upsert(lot, { onConflict: "numero_dossier" });
      if (error) throw new Error(`Upsert dossiers_edof: ${error.message}`);
    }
    // Réconciliation live : on COMPLÈTE uniquement les champs vides (jamais d'écrasement).
    for (const r of records) {
      const d = liveParNum.get(r.numero_dossier);
      if (!d) continue;
      const patch: Record<string, unknown> = {};
      if (!d.session_edof && r.numero_session) patch.session_edof = r.numero_session;
      if (!d.date_debut && r.date_debut) patch.date_debut = r.date_debut;
      if (!d.date_fin && r.date_fin) patch.date_fin = r.date_fin;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("dossiers").update(patch).eq("id", d.id);
      }
      // Go-forward facturation CPF : EDOF « Service fait validé » sur un dossier vivant CPF
      // → on ouvre le verrou (mirroir fidèle d'EDOF, jamais re-fermé). L'émission de la facture reste un clic humain.
      const estCpf = d.origine_fonds === "CPF_CDC" || d.financement === "CPF";
      if (estCpf && r.statut_dossier === "Service fait validé" && !d.service_fait_valide) {
        await supabaseAdmin.from("dossiers").update({ service_fait_valide: true }).eq("id", d.id);
        await journal("dossiers", String(d.id), "service_fait_valide_edof",
          { source: "import_edof", statut_edof: r.statut_dossier, numero_edof: r.numero_dossier }, opts.auteur ?? null);
        servicesFaitOuverts++;
        // Certificat de réalisation : généré + envoyé au stagiaire dès le service fait validé
        // côté EDOF (sa copie ; le dépôt EDOF qui déclenche le paiement reste un acte humain).
        try { await genererEtEnvoyerDocFin(String(d.id), "certificat_realisation", opts.auteur ?? null); } catch { /* best-effort */ }
      }
    }
    await supabaseAdmin.from("imports_edof").insert({
      fichier, importe_par: opts.auteur ?? null, total_lignes: records.length,
      crees, mis_a_jour: majs, rapproches_live: rapprochesLive, conflits: conflits.length,
      rapport: { par_annee: parAnnee, par_statut: parStatut, conflits: conflits.slice(0, 500) },
    });
  }

  return {
    total: records.length, crees, mis_a_jour: majs, rapproches_live: rapprochesLive,
    services_fait_ouverts: servicesFaitOuverts,
    conflits: conflits.slice(0, 200), conflits_total: conflits.length,
    par_annee: parAnnee, par_statut: parStatut, ignorees,
  };
}

// ---------------------------------------------------------------------------
// Contrôle de cohérence EDOF ↔ CRM (lecture seule). Aucune écriture.
// ---------------------------------------------------------------------------
export interface CoherenceEdof {
  total: number;
  par_statut: Record<string, number>;
  en_controle: number;
  montant_facturable: number;
  montant_facture: number;
  facture_renseigne: boolean;
  ecart_montant: number;
  rapproches_live: number;
  prets_a_facturer: number;
  ecarts_facturation: Array<{ numero: string; facturable: number; facture: number; ecart: number }>;
  en_controle_liste: Array<{ numero: string; statut: string; montant_facturable: number }>;
  anomalies: Array<{ niveau: "bloquant" | "info"; message: string }>;
}

export async function coherenceEdof(): Promise<CoherenceEdof> {
  const { data: edof } = await supabaseAdmin
    .from("dossiers_edof")
    .select("numero_dossier, statut_dossier, en_controle, montant_facturable, montant_facture");
  const rows = (edof ?? []) as any[];

  const parStatut: Record<string, number> = {};
  let enControle = 0, mFacturable = 0, mFacture = 0, factureRenseigne = false;
  const ecartsFact: CoherenceEdof["ecarts_facturation"] = [];
  const enControleListe: CoherenceEdof["en_controle_liste"] = [];
  for (const r of rows) {
    const st = r.statut_dossier ?? "?";
    parStatut[st] = (parStatut[st] ?? 0) + 1;
    const fb = Number(r.montant_facturable || 0);
    const fc = Number(r.montant_facture || 0);
    mFacturable += fb; mFacture += fc;
    if (r.montant_facture != null) factureRenseigne = true;
    if (r.en_controle) {
      enControle++;
      enControleListe.push({ numero: r.numero_dossier, statut: st, montant_facturable: fb });
    }
    if (r.montant_facturable != null && r.montant_facture != null && Math.abs(fb - fc) >= 1) {
      ecartsFact.push({ numero: r.numero_dossier, facturable: fb, facture: fc, ecart: fb - fc });
    }
  }

  // Rapprochement live + factures CPF prêtes à émettre (go-forward).
  const { data: live } = await supabaseAdmin
    .from("dossiers").select("id, numero_edof, origine_fonds, financement, service_fait_valide")
    .not("numero_edof", "is", null);
  const liveRows = (live ?? []) as any[];
  const edofNums = new Set(rows.map((r) => String(r.numero_dossier)));
  const rapprochesLive = liveRows.filter((d) => edofNums.has(String(d.numero_edof))).length;

  const { data: fact } = await supabaseAdmin.from("factures").select("dossier_id").not("dossier_id", "is", null);
  const dossiersFactures = new Set((fact ?? []).map((f: any) => String(f.dossier_id)));
  const pretsAFacturer = liveRows.filter((d) => {
    const estCpf = d.origine_fonds === "CPF_CDC" || d.financement === "CPF";
    return estCpf && d.service_fait_valide && !dossiersFactures.has(String(d.id));
  }).length;

  const anomalies: CoherenceEdof["anomalies"] = [];
  if (enControle > 0) anomalies.push({ niveau: "info", message: `${enControle} dossier(s) EDOF en contrôle CDC — paiement suspendu tant que le contrôle n'est pas levé.` });
  if (!factureRenseigne) anomalies.push({ niveau: "info", message: "Le montant facturé n'est pas fourni par cet export EDOF — l'écart facturable / facturé n'est pas calculable." });
  else if (ecartsFact.length > 0) anomalies.push({ niveau: "info", message: `${ecartsFact.length} dossier(s) avec un écart entre montant facturable et facturé EDOF — à vérifier.` });
  if (pretsAFacturer > 0) anomalies.push({ niveau: "info", message: `${pretsAFacturer} dossier(s) CPF vivant(s) « service fait validé » sans facture — à émettre depuis Factures.` });
  anomalies.push({ niveau: "info", message: "Les heures ne sont pas fournies par l'export EDOF : non contrôlables ici, elles se vérifient via l'émargement." });

  return {
    total: rows.length, par_statut: parStatut, en_controle: enControle,
    montant_facturable: mFacturable, montant_facture: mFacture, facture_renseigne: factureRenseigne,
    ecart_montant: factureRenseigne ? mFacturable - mFacture : 0,
    rapproches_live: rapprochesLive, prets_a_facturer: pretsAFacturer,
    ecarts_facturation: ecartsFact.slice(0, 100),
    en_controle_liste: enControleListe.slice(0, 100),
    anomalies,
  };
}
