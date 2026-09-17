/**
 * MYSTORY — Rattacher au dossier le test que le candidat a DÉJÀ passé.
 *
 * 17/09/2026. Le chaînon manquant du parcours d'inscription.
 *
 * Un prospect passe son test de positionnement sur test.mystoryformation.fr. Son
 * évaluation est enregistrée avec `dossier_id = null` — et c'est VOULU : créer un
 * dossier CPF automatiquement depuis un formulaire public est exactement ce que la
 * Caisse des dépôts sanctionne. La qualification reste humaine.
 *
 * Mais quand l'équipe crée ensuite le vrai dossier, rien ne rattache le test déjà
 * passé. Conséquence, sur les neuf étapes d'une inscription CPF : la fiche
 * d'analyse du besoin et l'évaluation initiale sont refaites à la main, alors que
 * la matière existe. C'est la moitié du travail de saisie, pour rien.
 *
 * Ce module ne crée aucun dossier. Il relie, APRÈS coup, une évaluation orpheline
 * au dossier d'une personne — sur l'adresse e-mail, qui est la seule clé fiable —
 * puis génère la pièce Qualiopi et inscrit le niveau d'entrée. La décision de
 * créer le dossier reste, elle, entièrement humaine.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { genererDocEvaluation } from "@/lib/evaluationDoc";
import { journal } from "@/lib/examens";

export type ResultatRattachement =
  | {
      ok: true;
      evaluation_id: string;
      niveau: string | null;
      piece_generee: boolean;
      raison_piece?: string;
    }
  | { ok: false; raison: string };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Cherche un test de positionnement TERMINÉ, non rattaché, appartenant à la même
 * personne que ce dossier, et le rattache.
 *
 * Volontairement strict :
 *  - `phase = 'initial'` — un test final ne dit rien du niveau d'entrée ;
 *  - `statut = 'complet'` — un test non corrigé n'a pas de niveau à inscrire ;
 *  - `dossier_id is null` — on ne vole jamais le test d'un autre dossier ;
 *  - correspondance sur l'e-mail exact. Le nom ne suffit pas : deux homonymes
 *    dans la même famille, et on rattache le test de la mauvaise personne — une
 *    pièce Qualiopi au mauvais niveau, c'est un dossier qui tombe au contrôle.
 */
export async function rattacherTestAuDossier(
  dossierId: string,
  auteur: string | null,
): Promise<ResultatRattachement> {
  const { data: dossier } = await supabaseAdmin
    .from("dossiers")
    .select("id, niveau_initial, stagiaires:stagiaire_id ( email )")
    .eq("id", dossierId)
    .maybeSingle();
  if (!dossier) return { ok: false, raison: "Dossier introuvable." };

  const st: any = Array.isArray((dossier as any).stagiaires)
    ? (dossier as any).stagiaires[0]
    : (dossier as any).stagiaires;
  const email = norm(st?.email);
  if (!email) return { ok: false, raison: "Le stagiaire de ce dossier n'a pas d'adresse e-mail." };

  // Déjà rattaché : on ne refait rien, et on le dit.
  const { data: deja } = await supabaseAdmin
    .from("evaluations")
    .select("id")
    .eq("dossier_id", dossierId)
    .eq("phase", "initial")
    .limit(1)
    .maybeSingle();
  if (deja) return { ok: false, raison: "Ce dossier a déjà un test de positionnement." };

  const { data: candidats } = await supabaseAdmin
    .from("evaluations")
    .select("id, email, niveau_global, complete_le")
    .eq("phase", "initial")
    .eq("statut", "complet")
    .is("dossier_id", null)
    .order("complete_le", { ascending: false, nullsFirst: false })
    .limit(50);

  const ev = (candidats ?? []).find((e: any) => norm(e.email) === email);
  if (!ev) return { ok: false, raison: "Aucun test de positionnement corrigé au nom de cette adresse." };

  const { error } = await supabaseAdmin
    .from("evaluations").update({ dossier_id: dossierId }).eq("id", ev.id);
  if (error) return { ok: false, raison: "Rattachement impossible : " + error.message };

  // Le niveau d'entrée du dossier vient du test — il ne se ressaisit plus.
  if (ev.niveau_global) {
    const { error: eNiv } = await supabaseAdmin
      .from("dossiers").update({ niveau_initial: ev.niveau_global }).eq("id", dossierId);
    if (eNiv) {
      await journal("dossier", dossierId, "niveau_initial_maj_echouee",
        { niveau: ev.niveau_global, erreur: eNiv.message }, auteur);
    }
  }

  // La pièce Qualiopi « évaluation initiale » se génère maintenant toute seule.
  let piece = { ok: false, raison: undefined as string | undefined };
  try {
    piece = (await genererDocEvaluation(dossierId, "initial", auteur)) as any;
  } catch (e: any) {
    piece = { ok: false, raison: String(e?.message ?? e) };
  }

  await journal("dossier", dossierId, "test_rattache", {
    evaluation_id: ev.id, niveau: ev.niveau_global,
    piece_generee: piece.ok, raison_piece: piece.raison ?? null,
  }, auteur);

  return {
    ok: true,
    evaluation_id: ev.id,
    niveau: ev.niveau_global ?? null,
    piece_generee: !!piece.ok,
    ...(piece.raison ? { raison_piece: piece.raison } : {}),
  };
}

/** Garde de type : `strict: false` empêche la restriction sur un booléen. */
export function echecRattachement(
  r: ResultatRattachement,
): r is Extract<ResultatRattachement, { ok: false }> {
  return r.ok === false;
}
