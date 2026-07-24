// lib/assistant/outils.ts
// Outils LECTURE SEULE de l'assistant CRM. Le LLM choisit l'outil + les arguments,
// le serveur exécute une requête cadrée (jamais de SQL libre). Aucune écriture.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedMistral, versVecteurSql } from "@/lib/ai/embeddings";

function aujParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function ajouterJours(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Nettoie un terme de recherche avant un filtre PostgREST (ilike / or) — pas d'injection de filtre.
function nettoie(s: any): string {
  return String(s ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
}
function eur(n: any): string {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export type Outil = { schema: any; run: (args: any) => Promise<any> };

export const OUTILS: Record<string, Outil> = {
  // 1 — Dossiers de formation (CPF/OPCO)
  rechercher_dossier: {
    schema: { type: "function", function: {
      name: "rechercher_dossier",
      description: "Recherche un dossier de FORMATION (CPF/OPCO) par nom ou prénom du stagiaire. Renvoie statut, certification, financement, montant, niveaux, heures, avancement du tunnel.",
      parameters: { type: "object", properties: { recherche: { type: "string", description: "Nom ou prénom du stagiaire" } }, required: ["recherche"] },
    } },
    run: async ({ recherche }) => {
      const q = nettoie(recherche);
      if (!q) return { erreur: "Recherche vide." };
      const { data: stg, error: e1 } = await supabaseAdmin
        .from("stagiaires").select("id,nom,prenom,email,telephone,agence")
        .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`).limit(10);
      if (e1) return { erreur: e1.message };
      if (!stg || !stg.length) return { resultat: `Aucun stagiaire trouvé pour « ${q} ».` };
      const ids = stg.map((s: any) => s.id);
      const { data: dos } = await supabaseAdmin
        .from("dossiers")
        .select("id,stagiaire_id,certif,financement,montant,statut,statut_tunnel,niveau_initial,niveau_vise,heures_prevues,heures_realisees,date_debut,date_fin,vendu_par,service_fait_valide")
        .in("stagiaire_id", ids);
      return { stagiaires: stg, dossiers: dos || [] };
    },
  },

  // 2 — Candidats examen
  rechercher_candidat_examen: {
    schema: { type: "function", function: {
      name: "rechercher_candidat_examen",
      description: "Recherche un candidat à l'EXAMEN (TEF IRN / civique) par nom ou prénom. Renvoie ses inscriptions : type, date d'examen, montant, mode et statut de paiement, reste à payer.",
      parameters: { type: "object", properties: { recherche: { type: "string", description: "Nom ou prénom du candidat" } }, required: ["recherche"] },
    } },
    run: async ({ recherche }) => {
      const q = nettoie(recherche);
      if (!q) return { erreur: "Recherche vide." };
      const { data, error } = await supabaseAdmin
        .from("examens")
        .select("nom,prenom,type_examen,sous_type,date_examen,horaire,agence_vente,vendu_par,montant_eur,mode_paiement,statut_paiement,reste_a_payer_eur,statut_reglement,inscrit_cci")
        .eq("actif", true).or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`).limit(20);
      if (error) return { erreur: error.message };
      if (!data || !data.length) return { resultat: `Aucun candidat examen trouvé pour « ${q} ».` };
      return { candidats: data };
    },
  },

  // 3 — Ventes examens sur une période
  ventes_examen_periode: {
    schema: { type: "function", function: {
      name: "ventes_examen_periode",
      description: "Chiffre les ventes d'EXAMENS sur une période (filtre par date d'inscription = date de vente). Renvoie nombre de ventes, total encaissé, et répartition par vendeur. Utilise le format de date AAAA-MM-JJ.",
      parameters: { type: "object", properties: {
        du: { type: "string", description: "Date de début (AAAA-MM-JJ)" },
        au: { type: "string", description: "Date de fin (AAAA-MM-JJ)" },
        vendeur: { type: "string", description: "Optionnel : filtrer sur un vendeur" },
      }, required: ["du", "au"] },
    } },
    run: async ({ du, au, vendeur }) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(du)) ? du : null;
      const a = /^\d{4}-\d{2}-\d{2}$/.test(String(au)) ? au : null;
      if (!d || !a) return { erreur: "Dates invalides (attendu AAAA-MM-JJ)." };
      let req = supabaseAdmin.from("examens")
        .select("montant_eur,vendu_par,statut_reglement")
        .eq("actif", true).gte("date_inscription", d).lte("date_inscription", a);
      const v = nettoie(vendeur);
      if (v) req = req.ilike("vendu_par", `%${v}%`);
      const { data, error } = await req;
      if (error) return { erreur: error.message };
      const lignes = (data || []).filter((r: any) => String(r.statut_reglement || "").toLowerCase().indexOf("rembours") === -1);
      const total = lignes.reduce((s: number, r: any) => s + (Number(r.montant_eur) || 0), 0);
      const parVendeur: Record<string, { ventes: number; total: number }> = {};
      for (const r of lignes) {
        const k = r.vendu_par || "(non renseigné)";
        parVendeur[k] = parVendeur[k] || { ventes: 0, total: 0 };
        parVendeur[k].ventes++; parVendeur[k].total += Number(r.montant_eur) || 0;
      }
      return { periode: `${d} → ${a}`, nb_ventes: lignes.length, total_encaisse: eur(total),
        par_vendeur: Object.entries(parVendeur).map(([nom, x]) => ({ vendeur: nom, ventes: x.ventes, total: eur(x.total) })).sort((a2, b2) => b2.ventes - a2.ventes) };
    },
  },

  // 4 — Impayés examen
  impayes_examen: {
    schema: { type: "function", function: {
      name: "impayes_examen",
      description: "Liste les candidats examen avec un RESTE À PAYER (> 0 €), hors remboursés. Trié du plus gros au plus petit.",
      parameters: { type: "object", properties: {} },
    } },
    run: async () => {
      const { data, error } = await supabaseAdmin
        .from("examens")
        .select("nom,prenom,type_examen,date_examen,agence_vente,vendu_par,montant_eur,reste_a_payer_eur,statut_paiement,telephone")
        .eq("actif", true).gt("reste_a_payer_eur", 0)
        .order("reste_a_payer_eur", { ascending: false }).limit(50);
      if (error) return { erreur: error.message };
      const lignes = (data || []);
      const total = lignes.reduce((s: number, r: any) => s + (Number(r.reste_a_payer_eur) || 0), 0);
      return { nb: lignes.length, total_du: eur(total), candidats: lignes.map((r: any) => ({ ...r, montant_eur: eur(r.montant_eur), reste_a_payer_eur: eur(r.reste_a_payer_eur) })) };
    },
  },

  // 5 — Sessions d'examen à venir
  sessions_examen_a_venir: {
    schema: { type: "function", function: {
      name: "sessions_examen_a_venir",
      description: "Liste les SESSIONS d'examen à venir dans les N prochains jours (type, date, horaire, centre, capacité).",
      parameters: { type: "object", properties: { jours: { type: "number", description: "Horizon en jours (défaut 14)" } } },
    } },
    run: async ({ jours }) => {
      const n = Math.min(Math.max(parseInt(String(jours ?? 14), 10) || 14, 1), 120);
      const auj = aujParis();
      const { data, error } = await supabaseAdmin
        .from("sessions_examen")
        .select("type,date_examen,horaire,centre,capacite,note")
        .gte("date_examen", auj).lte("date_examen", ajouterJours(auj, n))
        .order("date_examen", { ascending: true }).order("horaire", { ascending: true }).limit(60);
      if (error) return { erreur: error.message };
      return { horizon_jours: n, nb: (data || []).length, sessions: data || [] };
    },
  },

  // 6 — Factures impayées
  factures_impayees: {
    schema: { type: "function", function: {
      name: "factures_impayees",
      description: "Liste les FACTURES non réglées (sans date de paiement), hors annulées.",
      parameters: { type: "object", properties: {} },
    } },
    run: async () => {
      const { data, error } = await supabaseAdmin
        .from("factures")
        .select("numero,montant,client,designation,statut,date_emission,mode_reglement")
        .is("date_paiement", null).neq("statut", "annulee")
        .order("date_emission", { ascending: true }).limit(50);
      if (error) return { erreur: error.message };
      const lignes = (data || []);
      const total = lignes.reduce((s: number, r: any) => s + (Number(r.montant) || 0), 0);
      return { nb: lignes.length, total: eur(total), factures: lignes.map((r: any) => ({ ...r, montant: eur(r.montant) })) };
    },
  },

  // 7 — Grille tarifaire
  prix_formules: {
    schema: { type: "function", function: {
      name: "prix_formules",
      description: "Donne la grille tarifaire des formules (prix par certification et nombre d'heures, par financement).",
      parameters: { type: "object", properties: { certif: { type: "string", description: "Optionnel : filtrer sur une certification (ex. TEF IRN)" } } },
    } },
    run: async ({ certif }) => {
      let req = supabaseAdmin.from("formules")
        .select("certif,heures,prix_eur,libelle,financement,frais_examen_inclus").eq("actif", true);
      const c = nettoie(certif);
      if (c) req = req.ilike("certif", `%${c}%`);
      const { data, error } = await req.order("certif").order("heures");
      if (error) return { erreur: error.message };
      return { formules: (data || []).map((r: any) => ({ ...r, prix_eur: eur(r.prix_eur) })) };
    },
  },

  // 8 — Compteurs clés
  stats_globales: {
    schema: { type: "function", function: {
      name: "stats_globales",
      description: "Donne des compteurs clés du CRM : dossiers par statut, examens à venir (14 j), candidats en impayé.",
      parameters: { type: "object", properties: {} },
    } },
    run: async () => {
      const auj = aujParis();
      const { data: dos } = await supabaseAdmin.from("dossiers").select("statut");
      const parStatut: Record<string, number> = {};
      for (const r of dos || []) { const k = (r as any).statut || "(vide)"; parStatut[k] = (parStatut[k] || 0) + 1; }
      const { count: examsAvenir } = await supabaseAdmin.from("sessions_examen")
        .select("id", { count: "exact", head: true }).gte("date_examen", auj).lte("date_examen", ajouterJours(auj, 14));
      const { count: impayes } = await supabaseAdmin.from("examens")
        .select("id", { count: "exact", head: true }).eq("actif", true).gt("reste_a_payer_eur", 0);
      return { dossiers_par_statut: parStatut, sessions_examen_14j: examsAvenir ?? 0, candidats_impayes: impayes ?? 0 };
    },
  },

  // 9 — Base de connaissance (RAG : FAQ, techniques de vente, procédures)
  rechercher_connaissance: {
    schema: { type: "function", function: {
      name: "rechercher_connaissance",
      description: "Recherche dans la base de connaissance MYSTORY (FAQ, techniques de vente, procédures, règles) pour répondre aux questions de type « comment fait-on… », « quelle est la règle pour… », « que faire si… », « quel process pour… ». À utiliser pour toute question sur les procédures/règles internes plutôt que sur des données chiffrées.",
      parameters: { type: "object", properties: { question: { type: "string", description: "La question ou le sujet à rechercher dans la connaissance interne" } }, required: ["question"] },
    } },
    run: async ({ question }) => {
      const q = nettoie(question) || String(question || "").trim().slice(0, 200);
      if (!q) return { erreur: "Question vide." };
      let vec: number[][];
      try { vec = await embedMistral([q]); } catch (e: any) { return { erreur: "Recherche sémantique indisponible : " + (e?.message || String(e)) }; }
      const { data, error } = await supabaseAdmin.rpc("match_kb_documents", { query_embedding: versVecteurSql(vec[0] || []), match_count: 5 });
      if (error) return { erreur: error.message };
      if (!data || !(data as any[]).length) return { resultat: "Aucun élément de connaissance trouvé. (La base est peut-être vide — relancer la réindexation.)" };
      return { extraits: (data as any[]).map((d) => ({ source: d.source, titre: d.titre, contenu: String(d.contenu || "").slice(0, 900), pertinence: Math.round((d.similarite || 0) * 100) / 100 })) };
    },
  },
};
