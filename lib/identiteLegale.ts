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
  raison: "MYSTORY — SASU",
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

/** Ligne de pied de page légal prête à imprimer (documents + emails). */
export function piedLegal(): string {
  const i = identiteLegale();
  return `${i.raison} · ${i.rcs} · SIRET ${i.siret} · Déclaration d'activité n° ${i.nda} (ne vaut pas agrément de l'État) · ${i.telephone} · ${i.email}`;
}
