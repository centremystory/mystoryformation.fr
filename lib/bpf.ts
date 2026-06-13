/**
 * MYSTORY — Synthèse BPF (Cerfa 10443*16, §8). Année N-1 par défaut.
 * Principe directeur : RENDRE LES ÉCARTS VISIBLES, jamais les lisser.
 *
 * Sources :
 *  • Produits & heures historiques → vue v_bpf_edof (dérivées de l'export EDOF).
 *  • Produits & heures vivants      → dossiers (montant_encaisse, émargement réel) de l'année.
 *  • Charges « achats de prestations » → table sous_traitance (sens = confiee).
 *
 * Les heures historiques sont ESTIMÉES (grille tarif × taux EDOF) — distinguées des heures
 * réellement émargées des dossiers vivants. Le rapport le signale explicitement.
 */
import { supabaseAdmin } from "./supabaseAdmin";

const LIB_ORIGINE: Record<string, string> = {
  CPF_CDC: "CPF / Caisse des Dépôts", OPCO: "OPCO", Entreprise: "Entreprises",
  France_Travail: "France Travail", Region_Etat: "Région / État",
  Particulier: "Particuliers (reste à charge)", Autre_OF: "Autres OF (sous-traitance reçue)", Autre: "Autres produits",
};

export interface BpfSynthese {
  annee: number;
  produits: { par_origine: Array<{ origine: string; libelle: string; montant: number }>; total: number };
  heures_stagiaires: { total: number; estimees: number; emargees: number };
  nb_stagiaires: number;
  nb_dossiers: number;
  par_certif: Array<{ code: string; intitule: string; dossiers: number; produits: number; heures: number }>;
  charges: { sous_traitance_total: number; lignes: Array<{ prestataire: string; montant: number; facture_ref: string | null; contrat_ref: string | null; attestation: boolean }> };
  depot: null | { total_produits: number; cpf: number; plan_autres: number; autres_of: number; autres_produits: number; part_ca_pct: number; charges_total: number; salaires_formateurs: number; achats_prestations: number; cerfa: string | null };
  ecarts: Array<{ poste: string; crm: number; depose: number; ecart: number }>;
  anomalies: Array<{ niveau: "bloquant" | "info"; message: string }>;
}

export async function bpfSynthese(annee: number): Promise<BpfSynthese> {
  // --- Historique EDOF (vue dérivée) ---
  const { data: edof } = await supabaseAdmin
    .from("v_bpf_edof")
    .select("numero_dossier, nom, prenom, date_naissance, code_certif, intitule_certif, origine_fonds, montant_facturable, heures_realisees_estimees, heures_contractuelles, realise, taux_realisation")
    .eq("annee", annee);

  const realises = (edof ?? []).filter((d: any) => d.realise);

  const produitsParOrigine = new Map<string, number>();
  const parCertif = new Map<string, { code: string; intitule: string; dossiers: number; produits: number; heures: number }>();
  const stagiaires = new Set<string>();
  let heuresEstimees = 0;
  let sansHeures = 0;

  for (const d of realises as any[]) {
    const orig = d.origine_fonds || "Autre";
    produitsParOrigine.set(orig, (produitsParOrigine.get(orig) ?? 0) + Number(d.montant_facturable || 0));
    const h = d.heures_realisees_estimees != null ? Number(d.heures_realisees_estimees) : null;
    if (h == null) sansHeures++; else heuresEstimees += h;
    const key = `${(d.nom ?? "").toLowerCase()}|${(d.prenom ?? "").toLowerCase()}|${d.date_naissance ?? ""}`;
    stagiaires.add(key);
    const c = d.code_certif || "?";
    const cur = parCertif.get(c) ?? { code: c, intitule: d.intitule_certif || "", dossiers: 0, produits: 0, heures: 0 };
    cur.dossiers++; cur.produits += Number(d.montant_facturable || 0); cur.heures += h ?? 0;
    parCertif.set(c, cur);
  }

  // --- Dossiers vivants de l'année (encaissé N-1 + heures réellement émargées) ---
  const { data: live } = await supabaseAdmin
    .from("dossiers")
    .select("id, origine_fonds, montant_encaisse, date_encaissement, planning ( heures_realisees )")
    .not("date_encaissement", "is", null);
  let heuresEmargees = 0;
  for (const d of (live ?? []) as any[]) {
    const an = d.date_encaissement ? Number(String(d.date_encaissement).slice(0, 4)) : null;
    if (an !== annee) continue;
    const orig = d.origine_fonds || "Autre";
    produitsParOrigine.set(orig, (produitsParOrigine.get(orig) ?? 0) + Number(d.montant_encaisse || 0));
    for (const s of d.planning ?? []) heuresEmargees += Number(s.heures_realisees || 0);
  }

  // --- Charges : sous-traitance confiée de l'année ---
  const { data: st } = await supabaseAdmin
    .from("sous_traitance").select("prestataire, montant, facture_ref, contrat_ref, attestation_anti_demarchage")
    .eq("annee", annee).eq("sens", "confiee");
  const lignesST = (st ?? []).map((s: any) => ({
    prestataire: s.prestataire, montant: Number(s.montant || 0),
    facture_ref: s.facture_ref ?? null, contrat_ref: s.contrat_ref ?? null, attestation: !!s.attestation_anti_demarchage,
  }));
  const sousTraitanceTotal = lignesST.reduce((a, l) => a + l.montant, 0);

  const totalProduits = [...produitsParOrigine.values()].reduce((a, b) => a + b, 0);
  const heuresTotal = heuresEstimees + heuresEmargees;

  // --- Référence : BPF déposé (vérité officielle) pour réconciliation ---
  const { data: dep } = await supabaseAdmin
    .from("bpf_depots")
    .select("total_produits, cpf, plan_autres, autres_of, autres_produits, part_ca_pct, charges_total, salaires_formateurs, achats_prestations, cerfa")
    .eq("annee", annee).maybeSingle();
  const depot = dep ? {
    total_produits: Number(dep.total_produits || 0), cpf: Number(dep.cpf || 0),
    plan_autres: Number(dep.plan_autres || 0), autres_of: Number(dep.autres_of || 0),
    autres_produits: Number(dep.autres_produits || 0), part_ca_pct: Number(dep.part_ca_pct || 0),
    charges_total: Number(dep.charges_total || 0), salaires_formateurs: Number(dep.salaires_formateurs || 0),
    achats_prestations: Number(dep.achats_prestations || 0), cerfa: dep.cerfa ?? null,
  } : null;

  // --- Contrôles & anomalies (visibles, jamais masqués) ---
  const anomalies: BpfSynthese["anomalies"] = [];
  const ecarts: BpfSynthese["ecarts"] = [];
  if (depot) {
    const cpfCrm = produitsParOrigine.get("CPF_CDC") ?? 0;
    ecarts.push({ poste: "Produits CPF / CDC", crm: cpfCrm, depose: depot.cpf, ecart: cpfCrm - depot.cpf });
    ecarts.push({ poste: "Total produits", crm: totalProduits, depose: depot.total_produits, ecart: totalProduits - depot.total_produits });
    ecarts.push({ poste: "Achats de prestations (sous-traitance)", crm: sousTraitanceTotal, depose: depot.achats_prestations, ecart: sousTraitanceTotal - depot.achats_prestations });
    for (const e of ecarts) {
      if (Math.abs(e.ecart) >= 1) {
        anomalies.push({ niveau: e.poste === "Achats de prestations (sous-traitance)" ? "info" : "bloquant",
          message: `${e.poste} : CRM ${Math.round(e.crm).toLocaleString("fr-FR")} € vs déposé ${Math.round(e.depose).toLocaleString("fr-FR")} € (écart ${e.ecart > 0 ? "+" : ""}${Math.round(e.ecart).toLocaleString("fr-FR")} €).` });
      }
    }
  } else {
    anomalies.push({ niveau: "info", message: "Aucun BPF déposé enregistré pour cette année : pas de comparaison possible." });
  }
  if (sousTraitanceTotal === 0 && depot && depot.achats_prestations > 0) {
    anomalies.push({ niveau: "bloquant", message: `Sous-traitance non saisie dans le CRM alors que ${Math.round(depot.achats_prestations).toLocaleString("fr-FR")} € d'achats de prestations ont été déposés. À ressaisir pour retrouver la traçabilité.` });
  }
  for (const l of lignesST) {
    if (!l.contrat_ref || !l.attestation) {
      anomalies.push({ niveau: "info", message: `Sous-traitant « ${l.prestataire} » : ${!l.contrat_ref ? "contrat manquant" : ""}${!l.contrat_ref && !l.attestation ? " · " : ""}${!l.attestation ? "attestation anti-démarchage manquante" : ""}.` });
    }
  }
  if (sansHeures > 0) {
    anomalies.push({ niveau: "bloquant", message: `${sansHeures} dossier(s) réalisé(s) sans heures calculables (montant hors grille) — à vérifier.` });
  }
  anomalies.push({ niveau: "info", message: "Heures-stagiaires historiques ESTIMÉES (grille tarif × taux EDOF), l'export EDOF ne contenant pas les heures. À rapprocher des heures déclarées EDOF." });
  anomalies.push({ niveau: "info", message: "Produits à rapprocher du chiffre d'affaires comptable (réconciliation CRM ↔ compta non automatisée)." });

  return {
    annee,
    produits: {
      par_origine: [...produitsParOrigine.entries()]
        .map(([origine, montant]) => ({ origine, libelle: LIB_ORIGINE[origine] ?? origine, montant }))
        .sort((a, b) => b.montant - a.montant),
      total: totalProduits,
    },
    heures_stagiaires: { total: heuresTotal, estimees: heuresEstimees, emargees: heuresEmargees },
    nb_stagiaires: stagiaires.size,
    nb_dossiers: realises.length,
    par_certif: [...parCertif.values()].sort((a, b) => b.produits - a.produits),
    charges: { sous_traitance_total: sousTraitanceTotal, lignes: lignesST },
    depot,
    ecarts,
    anomalies,
  };
}
