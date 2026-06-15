/**
 * MYSTORY — Scanner de conformité EDOF/Qualiopi (CDC directeur §6).
 * Balaye TOUS les dossiers actifs et fait remonter ceux « à risque » avant un contrôle :
 *  - pièces obligatoires manquantes (ordre du dossier conforme)
 *  - convention non signée
 *  - n° de dossier EDOF absent
 *  - délai d'accès < 11 jours ouvrés
 *  - durée (heures) non renseignée
 *  - formatrice référente sans justificatif FLE
 * Lecture seule. Aucune écriture.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joursOuvresEntre, DELAI_ACCES_JOURS_OUVRES } from "@/lib/inscriptions/regles";

export type Gravite = "haute" | "moyenne";
export type Anomalie = { code: string; label: string; gravite: Gravite };
export type DossierRisque = {
  dossierId: string;
  stagiaire: string;
  agence: string | null;
  certif: string;
  financement: string;
  anomalies: Anomalie[];
};

const LABEL_PIECE: Record<string, string> = {
  fiche_analyse_besoin: "Fiche d'analyse de besoin",
  evaluation_initiale: "Évaluation initiale",
  satisfaction_chaud: "Questionnaire de satisfaction (à chaud)",
  convention: "Convention",
  programme: "Programme (A1)",
  reglement_interieur: "Règlement intérieur (A2)",
  planning: "Planning (A3)",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement",
  evaluation_finale: "Évaluation finale",
  attestation_fin: "Attestation de fin",
  certificat_realisation: "Certificat de réalisation",
};

function estCpf(d: any): boolean {
  return d.financement === "CPF" || d.origine_fonds === "CPF_CDC";
}

export async function scannerConformiteEdof(): Promise<DossierRisque[]> {
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select(`
      id, certif, financement, origine_fonds, statut, numero_edof,
      heures_prevues, date_validation_commande, date_debut, formatrice_id,
      stagiaire:stagiaires!inner (nom, prenom, agence),
      formatrice:formatrices!formatrice_id (nom, justificatif_fle),
      pieces ( type, statut, optionnelle, exige_signature )
    `)
    .not("statut", "in", "(\"annule\",\"archive\")");
  if (error || !data) return [];

  const resultats: DossierRisque[] = [];

  for (const d of data as any[]) {
    const anomalies: Anomalie[] = [];
    const pieces = (d.pieces ?? []) as any[];

    // 1) Pièces obligatoires manquantes
    const manquantes = pieces
      .filter((p) => !p.optionnelle && p.statut === "manquant")
      .map((p) => LABEL_PIECE[p.type] ?? p.type);
    if (manquantes.length > 0) {
      anomalies.push({ code: "pieces_manquantes", gravite: "haute", label: `Pièce(s) manquante(s) : ${manquantes.join(", ")}` });
    }

    // 2) Convention non signée
    const conv = pieces.find((p) => p.type === "convention");
    if (conv && conv.exige_signature && conv.statut !== "signee" && conv.statut !== "manquant") {
      anomalies.push({ code: "convention_non_signee", gravite: "moyenne", label: "Convention pas encore signée" });
    }

    // 3) N° EDOF absent (dossiers CPF)
    if (estCpf(d) && !d.numero_edof) {
      anomalies.push({ code: "edof_absent", gravite: "haute", label: "N° de dossier EDOF non renseigné" });
    }

    // 4) Délai d'accès < 11 jours ouvrés
    if (d.date_validation_commande && d.date_debut) {
      const jo = joursOuvresEntre(new Date(d.date_validation_commande), new Date(d.date_debut));
      if (jo < DELAI_ACCES_JOURS_OUVRES) {
        anomalies.push({ code: "delai_court", gravite: "haute", label: `Délai d'accès trop court : ${jo} j ouvrés (< ${DELAI_ACCES_JOURS_OUVRES})` });
      }
    }

    // 5) Durée non renseignée
    if (d.heures_prevues == null || Number(d.heures_prevues) <= 0) {
      anomalies.push({ code: "duree_absente", gravite: "moyenne", label: "Durée (heures) non renseignée" });
    }

    // 6) Formatrice référente sans justificatif FLE
    if (d.formatrice_id && d.formatrice && !d.formatrice.justificatif_fle) {
      anomalies.push({ code: "fle_manquant", gravite: "haute", label: `Formatrice ${d.formatrice.nom} sans justificatif FLE` });
    }

    if (anomalies.length > 0) {
      const s = d.stagiaire;
      resultats.push({
        dossierId: d.id,
        stagiaire: `${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim() || "—",
        agence: s?.agence ?? null,
        certif: d.certif,
        financement: d.financement,
        anomalies,
      });
    }
  }

  // Tri : plus d'anomalies hautes d'abord
  const score = (r: DossierRisque) => r.anomalies.filter((a) => a.gravite === "haute").length * 10 + r.anomalies.length;
  return resultats.sort((a, b) => score(b) - score(a));
}
