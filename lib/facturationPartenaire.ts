/**
 * MYSTORY — Facturation d'un organisme partenaire, session par session.
 *
 * Extrait de /api/partenaires/facturation le 15/09/2026, pour que la facturation
 * automatique du jour d'examen et la facturation manuelle depuis l'interface
 * partagent EXACTEMENT le meme code. Deux implementations, ce sont deux series
 * de numeros qui divergent un jour — et une numerotation de factures qui saute
 * ne se repare pas apres coup.
 *
 * L'article 7 de la convention fixe la regle : « Le Centre emet sa facture au
 * plus tard deux jours ouvres apres la session, pour l'ensemble des places
 * consommees ET DES PLACES DUES. » Une facture couvre donc UNE session et TOUS
 * les candidats que le partenaire y a places — y compris les absents, dont la
 * place reste due.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { journal } from "./examens";

export type ResultatFacture =
  | { ok: true; facture: { id: string; numero: string; montant: number; places: number } }
  | { ok: false; erreur: string; code: number };

/** Le tarif partenaire qui s'applique, selon le type d'examen de la session. */
export function tarifPartenaire(p: any, typeSession: string): number {
  const civique = String(typeSession ?? "").toLowerCase().includes("civique");
  return Number((civique ? p.tarif_civique : p.tarif_tef_irn) ?? 0);
}

/**
 * Emet la facture d'UNE session pour UN partenaire.
 * Ne leve pas : renvoie { ok:false, erreur, code } pour que l'appelant decide.
 */
export async function facturerSession(params: {
  partenaireId: string;
  sessionId: string;
  auteur?: string | null;
}): Promise<ResultatFacture> {
  const { partenaireId, sessionId, auteur } = params;

  const { data: p } = await supabaseAdmin
    .from("partenaires")
    .select("id, raison_sociale, tarif_tef_irn, tarif_civique, serie_facture")
    .eq("id", partenaireId).maybeSingle();
  if (!p) return { ok: false, erreur: "Partenaire introuvable.", code: 404 };
  if (!p.serie_facture) {
    return { ok: false, erreur: "Ce partenaire n'a pas de série de facturation.", code: 400 };
  }

  const { data: s } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, type, date_examen, horaire, centre")
    .eq("id", sessionId).maybeSingle();
  if (!s) return { ok: false, erreur: "Session introuvable.", code: 404 };

  // Les places de CE partenaire sur CETTE session, pas encore facturees.
  const { data: lignes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, candidat_nom, candidat_prenom")
    .eq("partenaire_id", partenaireId).eq("session_id", sessionId)
    .is("facture_id", null).in("statut", ["confirmee", "en_attente"]);

  if (!lignes?.length) {
    return { ok: false, erreur: "Rien à facturer : aucune place non facturée sur cette session.", code: 409 };
  }

  const pu = tarifPartenaire(p, s.type);
  if (pu <= 0) {
    return { ok: false, erreur: "Aucun tarif partenaire n'est défini pour ce type d'examen.", code: 400 };
  }
  const montant = lignes.length * pu;

  // Numero atomique : deux appels simultanes ne peuvent pas produire le meme
  // numero, ce qu'aucun comptage cote application ne garantit.
  const { data: num, error: eNum } = await supabaseAdmin
    .rpc("prochain_numero_facture", { p_serie: p.serie_facture });
  if (eNum || !num) {
    return {
      ok: false, code: 500,
      erreur: `Numérotation impossible pour la série « ${p.serie_facture} » : `
            + `${eNum?.message ?? "aucun compteur"}.`,
    };
  }

  const libelle = String(s.type).toLowerCase().includes("civique") ? "Examen civique" : "TEF IRN";
  const [an, mo, jo] = String(s.date_examen).slice(0, 10).split("-");
  const designation =
    `${lignes.length} passation${lignes.length > 1 ? "s" : ""} ${libelle} — session du `
    + `${jo}/${mo}/${an}${s.horaire ? ` (${s.horaire})` : ""}`
    + `${s.centre ? ` — ${s.centre}` : ""} — ${pu.toLocaleString("fr-FR")} € par candidat`;

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      numero: num, serie: p.serie_facture, type: "facture",
      client: p.raison_sociale, montant, designation, statut: "émise",
    })
    .select("id, numero, montant, date_emission").single();
  if (error) return { ok: false, erreur: error.message, code: 500 };

  // Rattachement : c'est ce lien qui empeche de refacturer les memes places.
  const { error: eLien } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .update({ facture_id: facture.id })
    .in("id", lignes.map((l: any) => l.id));
  if (eLien) {
    // La facture existe mais n'est rattachee a rien : on le signale plutot que
    // de laisser croire que c'est fait, sinon les memes places seront refacturees.
    return {
      ok: false, code: 500,
      erreur: `Facture ${num} créée, mais le rattachement des candidats a échoué : `
            + `${eLien.message}. À reprendre à la main avant toute nouvelle émission.`,
    };
  }

  await journal("facture", facture.id, "emission_partenaire",
    { partenaire: p.raison_sociale, numero: num, montant, places: lignes.length,
      session: `${s.date_examen} ${s.horaire}` }, auteur ?? null);

  return {
    ok: true,
    facture: { id: facture.id, numero: String(num), montant, places: lignes.length },
  };
}
