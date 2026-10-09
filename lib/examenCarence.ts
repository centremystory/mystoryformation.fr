/**
 * MYSTORY — Carences & règles d'inscription aux examens (conformité, vérification SERVEUR).
 *
 * checkInscriptionExamen() renvoie { ok, recap[] } — la route répond 409 + recap si KO.
 *
 * Règles (validées par la Direction) :
 *  · TEF IRN  : carence 20 JOURS CALENDAIRES depuis le dernier passage
 *               (nos ventes + un éventuel passage déclaré dans un autre centre).
 *  · Civique  : carence 48 H OUVRÉES (≥ 1 jour ouvré plein entre deux passages,
 *               week-ends et jours fériés sautés via joursOuvresEntre)
 *               + INTERDIT 2 mentions civiques DIFFÉRENTES le MÊME jour.
 *  · Plateforme de préparation : aucune carence.
 *
 * « Passage » qui consomme une carence = vente NON Annulée / NON Remboursée dont l'examen
 *   a eu lieu : passage effectif (Réussi/Échoué) OU absence comptent ; une vente annulée
 *   ou remboursée ne compte pas. On s'appuie sur statut_paiement ∉ {Annulé, Remboursé}
 *   et une date d'examen antérieure à la session visée.
 *
 * Override Direction : NON géré ici (la garde reste pure). Si la Direction force avec un
 *   motif, la route journalise et insère carence_forcee=true malgré un { ok:false }.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { joursOuvresEntre } from "./inscriptions/regles";

export const CARENCE_TEF_JOURS = 20; // jours calendaires entre deux TEF IRN
export const CARENCE_CIVIQUE_MIN_JOURS_OUVRES = 1; // ≥ 1 jour ouvré entre = ≈ 48 h ouvrées

export interface GateResult {
  ok: boolean;
  recap: string[];
}

/** YYYY-MM-DD → JJ/MM/AAAA (affichage). */
function jfr(iso: string): string {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

/** Ajoute n jours calendaires à une date ISO (YYYY-MM-DD), en UTC pour rester stable. */
function ajoutJours(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES DEUX CARENCES, ISOLÉES EN FONCTIONS PURES
   ─────────────────────────────────────────────────────────────────────────────
   09/10/2026. `checkInscriptionExamen()` ci-dessous reste LA garde : elle lit
   l'historique du candidat en base et c'est elle qui refuse une conversion.
   Mais la page publique `/commande` a besoin du MÊME calcul avant qu'un
   candidat existe en base — elle n'a qu'une date déclarée par le visiteur et
   aucune ligne à interroger.

   Ces deux fonctions sont donc l'arithmétique, et une seule fois. Sans elles,
   `/commande` aurait recopié « 20 jours calendaires » et « 48 h ouvrées », et
   les deux copies auraient divergé au premier ajustement de barème — c'est
   exactement le défaut qu'on passe nos journées à corriger ailleurs.

   ⚠️ Elles ne disent QUE si le délai est tenu. Elles ne savent pas d'où vient
   la date (notre historique ou une déclaration du candidat), et c'est voulu :
   c'est l'appelant qui sait ce que vaut sa source.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Le délai entre deux TEF IRN est-il tenu ? `reEligible` est la première date
 * qui le tiendrait — on la rend toujours, parce qu'un refus sans date de repli
 * fait fermer l'onglet.
 */
export function carenceTefTenue(
  dernierPassage: string, dateExamen: string,
): { ok: boolean; reEligible: string } {
  const ecartJours = Math.round((Date.parse(dateExamen) - Date.parse(dernierPassage)) / 86400000);
  return {
    ok: ecartJours >= CARENCE_TEF_JOURS,
    reEligible: ajoutJours(dernierPassage, CARENCE_TEF_JOURS),
  };
}

/**
 * Le délai entre deux examens civiques est-il tenu ?
 *
 * Compté en jours OUVRÉS (week-ends et fériés sautés), parce que 48 h entre
 * deux épreuves n'a de sens que si les deux journées existent : un passage le
 * vendredi et un autre le lundi sont à 72 h d'horloge mais à zéro jour ouvré
 * d'intervalle. Aucune date de repli n'est rendue : elle dépend du calendrier
 * des jours fériés, et l'appelant a mieux à proposer — nos sessions réelles.
 */
export function carenceCiviqueTenue(dernierPassage: string, dateExamen: string): boolean {
  const ouvresEntre = joursOuvresEntre(
    new Date(dernierPassage + "T00:00:00Z"), new Date(dateExamen + "T00:00:00Z"),
  );
  return ouvresEntre >= CARENCE_CIVIQUE_MIN_JOURS_OUVRES;
}

export async function checkInscriptionExamen(p: {
  candidatId: string;
  type: string; // TEF_IRN | Examen_civique | Vente_plateforme
  sousType: string | null;
  dateExamen: string | null; // YYYY-MM-DD de la session visée (null = plateforme)
  declaratifTefDate?: string | null; // passage TEF déclaré dans un autre centre
}): Promise<GateResult> {
  const recap: string[] = [];

  // Plateforme de préparation : aucune carence, aucune session.
  if (p.type === "Vente_plateforme" || !p.dateExamen) return { ok: true, recap };

  // Passages antérieurs du candidat (hors annulé / remboursé), avec la date d'examen de la session.
  const { data } = await supabaseAdmin
    .from("ventes_examen")
    .select("type_examen, sous_type, statut_paiement, sessions_examen:session_id (date_examen)")
    .eq("candidat_id", p.candidatId)
    .not("statut_paiement", "in", '("Remboursé","Annulé")');

  const passages = (data ?? [])
    .map((v: any) => ({
      type: v.type_examen as string,
      sousType: (v.sous_type ?? null) as string | null,
      date: (v.sessions_examen?.date_examen ?? null) as string | null,
    }))
    .filter((x) => !!x.date) as Array<{ type: string; sousType: string | null; date: string }>;

  if (p.type === "TEF_IRN") {
    const dates = passages.filter((x) => x.type === "TEF_IRN" && x.date < p.dateExamen!).map((x) => x.date);
    if (p.declaratifTefDate && p.declaratifTefDate < p.dateExamen!) dates.push(p.declaratifTefDate);
    const dernier = dates.sort().at(-1);
    if (dernier) {
      const { ok, reEligible } = carenceTefTenue(dernier, p.dateExamen!);
      if (!ok) {
        recap.push(
          `Carence TEF IRN non respectée : dernier passage le ${jfr(dernier)} ` +
            `(il faut ${CARENCE_TEF_JOURS} jours entre deux TEF IRN). ` +
            `Ré-éligible à partir du ${jfr(reEligible)}.`,
        );
      }
    }
  }

  if (p.type === "Examen_civique") {
    // (c) carence 48 h ouvrées depuis le dernier passage civique
    const ant = passages.filter((x) => x.type === "Examen_civique" && x.date < p.dateExamen!).map((x) => x.date);
    const dernier = ant.sort().at(-1);
    if (dernier) {
      if (!carenceCiviqueTenue(dernier, p.dateExamen!)) {
        recap.push(
          `Carence examen civique non respectée : dernier passage le ${jfr(dernier)} ` +
            `(il faut au moins 48 h ouvrées entre deux examens civiques). Choisissez une session ultérieure.`,
        );
      }
    }
    // (d) pas 2 mentions civiques DIFFÉRENTES le même jour
    const conflitMention = passages.some(
      (x) => x.type === "Examen_civique" && x.date === p.dateExamen && (x.sousType ?? "") !== (p.sousType ?? ""),
    );
    if (conflitMention) {
      recap.push(
        `Ce candidat est déjà inscrit à un examen civique d'une autre mention le ${jfr(p.dateExamen)}. ` +
          `Une seule mention civique par jour.`,
      );
    }
  }

  return { ok: recap.length === 0, recap };
}

/**
 * Anti-doublon à la saisie : le candidat a-t-il DÉJÀ une inscription active sur la
 * MÊME session + MÊME type (et même mention pour le civique) ? Une réinscription
 * (reinscription_de renseigné) n'est jamais un doublon. Plateforme : pas de doublon.
 */
export async function checkDoublonExamen(p: {
  candidatId: string;
  type: string;
  sousType: string | null;
  sessionId: string | null;
}): Promise<GateResult> {
  const recap: string[] = [];
  if (!p.sessionId || p.type === "Vente_plateforme") return { ok: true, recap };

  const { data } = await supabaseAdmin
    .from("ventes_examen")
    .select("numero_attestation, sous_type, statut_paiement, reinscription_de")
    .eq("candidat_id", p.candidatId)
    .eq("session_id", p.sessionId)
    .eq("type_examen", p.type)
    .not("statut_paiement", "in", '("Remboursé","Annulé")');

  const doublons = (data ?? []).filter((v: any) => {
    if (v.reinscription_de) return false; // réinscription = légitime, pas un doublon
    if (p.type === "Examen_civique") return (v.sous_type ?? "") === (p.sousType ?? ""); // même mention seulement
    return true;
  });

  if (doublons.length > 0) {
    const nums = doublons.map((v: any) => v.numero_attestation ?? "?").join(", ");
    recap.push(
      `Doublon probable : ce candidat a déjà une inscription active sur cette session ` +
        `(${p.type === "Examen_civique" ? "même mention" : "même examen"}) — attestation(s) ${nums}.`,
    );
  }
  return { ok: recap.length === 0, recap };
}
