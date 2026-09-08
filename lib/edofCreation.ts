/**
 * MYSTORY — Création des dossiers vivants à partir de l'export EDOF.
 *
 * 09/09/2026. L'import EDOF existant archive tout dans `dossiers_edof` et complète
 * les dossiers du CRM DÉJÀ créés à la main. Une commande passée sur Mon Compte
 * Formation qui n'avait pas encore de dossier restait donc à ressaisir
 * intégralement : identité, adresse, courriel, téléphone, dates, montant.
 *
 * Or l'export porte tout cela, et de façon complète — vérifié sur les 165 dossiers
 * inscrits en 2026 : nom, prénom, naissance, adresse, code postal, ville, courriel
 * et portable sont renseignés à 100 %.
 *
 * Ce module crée donc le stagiaire et le dossier manquants, pour les seules
 * commandes VIVANTES. On ne recrée jamais l'historique : un dossier « Service fait
 * validé » de 2024 n'a rien à faire dans le suivi courant.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { CATALOGUE } from "@/lib/inscriptions/regles";

/** Statuts EDOF qui décrivent un dossier encore vivant, donc à suivre dans le CRM. */
export const STATUTS_VIVANTS = ["Validé", "En formation", "Service fait déclaré"];

export type LigneEdof = Record<string, string>;

export type Creation = {
  numero_dossier: string;
  nom: string; prenom: string;
  statut_edof: string;
  montant: number | null;
  heures: number | null;
  raison_ignore?: string;          // rempli quand la ligne ne peut pas être créée
  stagiaire_existant: boolean;
};

export type RapportCreation = {
  candidats: number;               // lignes vivantes sans dossier CRM
  creables: number;
  ignorees: number;
  crees_dossiers: number;
  crees_stagiaires: number;
  detail: Creation[];
};

const nb = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** JJ/MM/AAAA → AAAA-MM-JJ (les dates EDOF sont au format français). */
const dateIso = (v: string | undefined): string | null => {
  const m = String(v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * Retrouve la durée à partir du montant facturé.
 *
 * Notre grille associe un prix unique à chaque palier : 750 € = 15 h, 1 170 € = 27 h…
 * Le rapprochement est donc exact, jamais approximatif. Une commande dont le montant
 * ne correspond à aucun palier n'est PAS créée : c'est le signe d'une remise, d'un
 * ancien tarif ou d'une saisie particulière, qui appelle un regard humain.
 */
export function heuresDepuisMontant(montant: number | null): number | null {
  if (montant == null) return null;
  const f = Object.values(CATALOGUE).find((x) => Math.abs(x.prixEuros - montant) < 0.5);
  if (f) return f.dureeHeures;
  // Les commandes anterieures au catalogue 2026 portent les tarifs de la grille
  // precedente. Sans eux, l'essai du 09/09/2026 sur l'export reel ne trouvait AUCUN
  // dossier creable : les 25 dossiers vivants etaient tous a 1 435, 1 150 ou 400 €.
  // Un dossier ancien reste un dossier a suivre, il doit pouvoir etre repris.
  const h = TARIFS_HISTORIQUES[Math.round(montant)];
  return h ?? null;
}

/** Grille en vigueur jusqu'au catalogue 2026. Ne jamais s'en servir pour VENDRE :
 *  elle n'existe plus au catalogue, elle ne sert qu'a relire l'historique EDOF. */
const TARIFS_HISTORIQUES: Record<number, number> = {
  400: 6, 805: 18, 1150: 30, 1435: 42,
};

/** Rapproche un stagiaire existant : courriel, puis portable, puis nom + prénom + naissance. */
async function trouverStagiaire(l: LigneEdof): Promise<string | null> {
  const mail = (l.COURRIEL || "").trim();
  if (mail) {
    const { data } = await supabaseAdmin.from("stagiaires").select("id").ilike("email", mail).limit(1).maybeSingle();
    if ((data as any)?.id) return (data as any).id;
  }
  const tel = (l.NUMERO_TELEPHONE_PORTABLE || "").replace(/[^0-9]/g, "").slice(-9);
  if (tel.length >= 9) {
    const { data } = await supabaseAdmin.from("stagiaires").select("id").ilike("telephone", `%${tel}`).limit(1).maybeSingle();
    if ((data as any)?.id) return (data as any).id;
  }
  const naiss = dateIso(l.DATE_DE_NAISSANCE);
  if (naiss && l.NOM && l.PRENOM) {
    const { data } = await supabaseAdmin.from("stagiaires").select("id")
      .ilike("nom", l.NOM.trim()).ilike("prenom", l.PRENOM.trim())
      .eq("date_naissance", naiss).limit(1).maybeSingle();
    if ((data as any)?.id) return (data as any).id;
  }
  return null;
}

async function creerStagiaire(l: LigneEdof): Promise<string | null> {
  const { data } = await supabaseAdmin.from("stagiaires").insert({
    civilite: (l.CIVILITE || "").trim() || null,
    nom: (l.NOM || "").trim() || null,
    prenom: (l.PRENOM || "").trim() || null,
    date_naissance: dateIso(l.DATE_DE_NAISSANCE),
    ville_naissance: (l.VILLE_LIEU_DE_NAISSANCE || "").trim() || null,
    pays: (l.PAYS_LIEU_DE_NAISSANCE || "").trim() || null,
    adresse: (l.ADRESSE_POSTALE || "").trim() || null,
    cp: (l.ADRESSE_CODE_POSTAL || "").trim() || null,
    ville: (l.ADRESSE_VILLE || "").trim() || null,
    email: (l.COURRIEL || "").trim() || null,
    telephone: (l.NUMERO_TELEPHONE_PORTABLE || l.NUMERO_TELEPHONE_FIXE || "").trim() || null,
    source_import: "edof",
    actif: true,
  }).select("id").maybeSingle();
  return (data as any)?.id ?? null;
}

/**
 * Analyse (et éventuellement crée) les dossiers vivants absents du CRM.
 * `mode: "dry_run"` n'écrit rien : c'est le mode par défaut, et celui qu'on montre
 * avant toute application.
 */
export async function creerDossiersManquants(
  lignes: LigneEdof[],
  opts: { mode: "dry_run" | "apply"; auteur?: string | null },
): Promise<RapportCreation> {
  const { data: live } = await supabaseAdmin.from("dossiers").select("numero_edof");
  const dejaLa = new Set((live ?? []).map((d: any) => String(d.numero_edof)).filter(Boolean));

  const rap: RapportCreation = {
    candidats: 0, creables: 0, ignorees: 0,
    crees_dossiers: 0, crees_stagiaires: 0, detail: [],
  };

  for (const l of lignes) {
    const num = (l.NUMERO_DOSSIER || "").trim();
    if (!num || dejaLa.has(num)) continue;
    if (!STATUTS_VIVANTS.includes((l.STATUT_DOSSIER || "").trim())) continue;
    rap.candidats++;

    const montant = nb(l.MONTANT_FACTURABLE) ?? nb(l.MONTANT_FORMATION);
    const heures = heuresDepuisMontant(montant);
    const stagiaireId = await trouverStagiaire(l);

    const c: Creation = {
      numero_dossier: num,
      nom: (l.NOM || "").trim(), prenom: (l.PRENOM || "").trim(),
      statut_edof: (l.STATUT_DOSSIER || "").trim(),
      montant, heures, stagiaire_existant: !!stagiaireId,
    };

    // heures_prevues est obligatoire et strictement positif cote base : sans duree
    // fiable, on n'invente pas — on laisse la ligne au conseiller.
    if (heures == null) {
      c.raison_ignore = montant == null
        ? "aucun montant dans l'export"
        : `montant de ${montant} € ne correspond à aucun palier du catalogue`;
      rap.ignorees++; rap.detail.push(c); continue;
    }
    rap.creables++;
    rap.detail.push(c);
    if (opts.mode !== "apply") continue;

    let sid = stagiaireId;
    if (!sid) { sid = await creerStagiaire(l); if (sid) rap.crees_stagiaires++; }
    if (!sid) { c.raison_ignore = "création du stagiaire impossible"; rap.ignorees++; continue; }

    const { error } = await supabaseAdmin.from("dossiers").insert({
      stagiaire_id: sid,
      certif: "TEF_IRN",
      financement: "CPF",
      origine_fonds: "CPF_CDC",
      montant,
      heures_prevues: heures,
      heures_edof: heures,
      numero_edof: num,
      session_edof: (l.NUMERO_SESSION || "").trim() || null,
      date_debut: dateIso(l.DATE_DEBUT_SESSION),
      date_fin: dateIso(l.DATE_FIN_SESSION),
      date_validation_commande: dateIso(l.DATE_INSCRIPTION),
      statut: "en_cours",
      cree_par: opts.auteur ?? "import_edof",
    });
    if (error) { c.raison_ignore = error.message; rap.ignorees++; rap.creables--; continue; }
    rap.crees_dossiers++;
    await journal("dossiers", num, "cree_depuis_edof",
      { numero_edof: num, heures, montant, statut_edof: c.statut_edof }, opts.auteur ?? "import_edof");
  }
  return rap;
}
