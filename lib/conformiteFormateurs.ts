/**
 * MYSTORY — Conformité formateurs (2b).
 * Deux contrôles, basés sur les séances À VENIR non encore émargées :
 *  1) fleManquant   : formatrices intervenant prochainement SANS justificatif FLE
 *                     (règle : toute personne affichée formatrice doit avoir un justificatif FLE).
 *  2) docsManquant  : formateurs sous-traitants (reliés à une formatrice qui a une séance à venir)
 *                     dont la charte OU le contrat de sous-traitance n'est pas signé.
 * Lecture service_role (côté serveur). Résilient : en cas d'erreur, renvoie des listes vides.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type FleManquant = { formatriceId: string; nom: string; prenom: string | null; prochaineSeance: string };
export type DocsManquant = { formateurId: string; nom: string; prenom: string | null; charteSignee: boolean; contratSignee: boolean; prochaineSeance: string };

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function conformiteFormateurs(): Promise<{ fleManquant: FleManquant[]; docsManquant: DocsManquant[] }> {
  try {
    const today = aujourdHuiParisISO();

    // Séances à venir, non absentes, non émargées
    const { data: seances } = await supabaseAdmin
      .from("planning")
      .select("formatrice_id, date_seance, absence, emarge_le")
      .gte("date_seance", today);
    const aVenir = (seances ?? []).filter((s: any) => !s.absence && !s.emarge_le && s.formatrice_id);

    // Prochaine séance par formatrice
    const prochaine = new Map<string, string>();
    for (const s of aVenir) {
      const cur = prochaine.get(s.formatrice_id);
      if (!cur || s.date_seance < cur) prochaine.set(s.formatrice_id, s.date_seance);
    }
    const formatriceIds = [...prochaine.keys()];
    if (formatriceIds.length === 0) return { fleManquant: [], docsManquant: [] };

    // Formatrices concernées
    const { data: formatrices } = await supabaseAdmin
      .from("formatrices").select("id, nom, prenom, justificatif_fle, actif").in("id", formatriceIds);
    const fmap = new Map((formatrices ?? []).map((f: any) => [f.id, f]));

    const fleManquant: FleManquant[] = formatriceIds
      .map((id) => ({ id, f: fmap.get(id) }))
      .filter(({ f }) => f && f.actif !== false && !f.justificatif_fle)
      .map(({ id, f }) => ({ formatriceId: id, nom: f.nom, prenom: f.prenom ?? null, prochaineSeance: prochaine.get(id)! }));

    // Formateurs sous-traitants reliés à ces formatrices + leurs documents
    const { data: formateurs } = await supabaseAdmin
      .from("formateurs")
      .select("id, nom, prenom, type, formatrice_id, actif, formateur_documents(type, statut)")
      .in("formatrice_id", formatriceIds);

    const docsManquant: DocsManquant[] = (formateurs ?? [])
      .filter((f: any) => f.actif !== false && f.type === "sous_traitant" && f.formatrice_id)
      .map((f: any) => {
        const charteSignee = (f.formateur_documents ?? []).some((d: any) => d.type === "charte" && d.statut === "signee");
        const contratSignee = (f.formateur_documents ?? []).some((d: any) => d.type === "contrat" && d.statut === "signee");
        return { formateurId: f.id, nom: f.nom, prenom: f.prenom ?? null, charteSignee, contratSignee, prochaineSeance: prochaine.get(f.formatrice_id)!, _ok: charteSignee && contratSignee };
      })
      .filter((x: any) => !x._ok)
      .map(({ _ok, ...rest }: any) => rest);

    return { fleManquant, docsManquant };
  } catch {
    return { fleManquant: [], docsManquant: [] };
  }
}
