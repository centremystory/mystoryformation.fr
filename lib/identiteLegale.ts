// MYSTORY — Identité LÉGALE (source unique éditable via /reglages, catégorie « Identité »).
// Lecture SYNCHRONE (pour les gabarits/emails sync) avec rafraîchissement en arrière-plan :
// au démarrage à froid, on renvoie les valeurs par défaut (= valeurs actuelles, aucune régression),
// puis le cache se met à jour tout seul dans la minute qui suit un changement.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type IdentiteLegale = {
  raison: string; siret: string; rcs: string; nda: string;
  telephone: string; email: string; mediateur: string; siteWeb: string;
};

const DEFAUT: IdentiteLegale = {
  raison: "MYSTORY — SASU au capital de 1 000 €",
  siret: "913 423 083 00017",
  rcs: "RCS Paris 913 423 083",
  nda: "11756521775",
  telephone: "06 81 43 16 54",
  email: "contact@mystoryformation.fr",
  mediateur: "CM2C (cm2c.net)",
  siteWeb: "mystoryformation.fr",
};

const CLES: Record<keyof IdentiteLegale, string> = {
  raison: "id_raison_sociale", siret: "id_siret", rcs: "id_rcs", nda: "id_nda",
  telephone: "id_telephone", email: "id_email", mediateur: "id_mediateur", siteWeb: "id_site_web",
};

let cache: IdentiteLegale = { ...DEFAUT };
let chargeAt = 0;
let enCours = false;
const TTL = 60_000;

async function rafraichir(): Promise<void> {
  enCours = true;
  try {
    const { data } = await supabaseAdmin.from("parametres").select("cle, valeur").in("cle", Object.values(CLES));
    const m: Record<string, string> = {};
    for (const r of (data ?? []) as Array<{ cle: string; valeur: string }>) m[r.cle] = r.valeur;
    const next = { ...DEFAUT };
    (Object.keys(CLES) as (keyof IdentiteLegale)[]).forEach((k) => { if (m[CLES[k]]) next[k] = m[CLES[k]]; });
    cache = next;
    chargeAt = Date.now();
  } catch { /* on garde les valeurs courantes */ }
  finally { enCours = false; }
}

/** Identité légale courante (synchrone) ; rafraîchissement en arrière-plan si périmé. */
export function identiteLegale(): IdentiteLegale {
  if (Date.now() - chargeAt > TTL && !enCours) void rafraichir();
  return cache;
}

/**
 * Le bloc légal COMPLET exigé par l'art. R. 123-237 du code de commerce.
 *
 * 09/10/2026. Les pieds de courriel du parc sont incomplets : `gabaritEmail()`
 * (lib/email.ts) et `piedLegal()` ci-dessous publient la raison sociale, le SIRET et
 * le NDA — mais ni le RCS, ni le SIÈGE SOCIAL, ni la TVA intracommunautaire. Leur
 * omission sur un document émis par la société est une contravention de 4e classe.
 *
 * Ce bloc-ci est conforme. Il est introduit comme un AJOUT, sans toucher aux deux
 * fonctions existantes : elles ont une quarantaine d'appelants, et les reprendre est
 * un chantier à mener sur sa propre branche. La première route à s'en servir est
 * `/api/rendez-vous`. Toute nouvelle route doit l'utiliser.
 *
 * ⚠️ TROIS PIÈGES, tous déjà tombés dans ce dépôt :
 *   1. La dénomination au greffe est « MY STORY » (deux mots) ; « MYSTORY » est
 *      l'enseigne commerciale. Le bloc légal porte la dénomination.
 *   2. Le SIREN est 913 423 083 et la TVA FR55 913 423 083. Le SIREN
 *      « 844 214 569 » et la TVA « FR06844214569 » sont FAUX et traînent encore
 *      dans de vieux documents : ils ne doivent jamais être reproduits.
 *   3. Le siège social est 14 rue Bichat, 75010 Paris. Ce n'est PAS un lieu
 *      d'accueil — on n'y reçoit personne — mais c'est l'adresse que la loi exige
 *      ici. Les adresses des centres se publient ailleurs.
 *
 * Capital, TVA et siège sont écrits en littéral : ils ne figurent pas dans la table
 * `parametres`, et les y ajouter sans que /reglages sache les éditer donnerait une
 * fausse impression de configurabilité.
 */
export function blocLegalComplet(): string {
  const i = identiteLegale();
  return (
    `MY STORY (enseigne MYSTORY) — SASU au capital de 1 000 € · ${i.rcs} · ` +
    `SIRET ${i.siret} · TVA FR55 913 423 083 · Siège social : 14 rue Bichat, 75010 Paris · ` +
    `Déclaration d'activité n° ${i.nda} auprès du préfet de région d'Île-de-France — ` +
    `cet enregistrement ne vaut pas agrément de l'État.`
  );
}

/** Ligne de pied de page légal prête à imprimer (documents + emails). */
export function piedLegal(): string {
  const i = identiteLegale();
  return `${i.raison} · ${i.rcs} · SIRET ${i.siret} · Déclaration d'activité n° ${i.nda} (ne vaut pas agrément de l'État) · ${i.telephone} · ${i.email}`;
}
