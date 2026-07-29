/**
 * MYSTORY — Référent handicap (Qualiopi indicateur 26).
 * Valeurs éditables en /reglages (table parametres) ; replis sûrs pour ne JAMAIS
 * laisser une balise vide dans le règlement intérieur. Renvoyé en `extras` aux
 * gabarits qui portent les balises {{referent_handicap_*}}.
 */
import { getParam } from "@/lib/parametres";
import { identiteLegale } from "@/lib/identiteLegale";

export async function referentHandicapExtras(): Promise<Record<string, string>> {
  const id = identiteLegale();
  const nom = (await getParam("referent_handicap_nom", "")).trim() || "Arudhan NATKUNASINGAM";
  const email = (await getParam("referent_handicap_email", "")).trim() || id.email || "contact@mystoryformation.fr";
  const tel = (await getParam("referent_handicap_tel", "")).trim() || id.telephone || "06 81 43 16 54";
  return { referent_handicap_nom: nom, referent_handicap_email: email, referent_handicap_tel: tel };
}
