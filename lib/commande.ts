/**
 * MYSTORY — la commande composée, côté serveur. Prix, créneaux, contrôles.
 *
 * 09/10/2026. Le site vitrine propose depuis aujourd'hui un parcours de réservation
 * complet — examen(s), matinées de préparation, plateformes — mais il ne sait pas
 * encaisser : le CRM ne vendait qu'UNE session, par `/inscription-examen?session=<id>`.
 * Une commande composée partait donc chez un conseiller, qui envoyait le lien à la main.
 * Ce fichier est la grille et l'arbitre de `/commande`, qui encaisse le tout.
 *
 * ── LA RÈGLE QUI TIENT TOUT ─────────────────────────────────────────────────────
 * Elle est déjà écrite dans `tarifsExamen.ts` et elle vaut ici à l'identique : le
 * montant n'est JAMAIS envoyé par le navigateur, il est recalculé à la réception.
 * L'URL de commande ne transporte aucun prix, volontairement. Un prix qui transite
 * par un formulaire est un prix qu'on peut modifier avec les outils de développement
 * — et on encaisserait alors 1 € pour une préparation à 660 €.
 *
 * La même logique s'applique à TOUT ce qui se compte : les places d'examen (voir
 * `lireSession`) et, depuis le 09/10, les places d'une matinée de préparation. Un
 * compteur qui ne vivrait que dans le navigateur se contourne en dix secondes.
 *
 * ── CE QUI N'EST PAS ICI ────────────────────────────────────────────────────────
 * Les tarifs d'examen eux-mêmes (185 / 250 / 80 / 100) et la règle des 7 jours
 * ouvrés restent dans `tarifsExamen.ts` : on ne les recopie pas, on les importe.
 * Deux grilles qui disent la même chose finissent toujours par se contredire.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { occupationDe } from "@/lib/occupationSessions";
import {
  TARIFS_PUBLICS, TARIFS_URGENCE, joursOuvresAvant,
  DELAI_TARIF_PUBLIC_JOURS_OUVRES, type TypeExamen,
} from "@/lib/tarifsExamen";
import { lireSession, jourLisible, type SessionPublique } from "@/lib/inscriptionEnLigne";

/* ─────────────────────────────────────────────────────────────────────────────
   LA PRÉPARATION
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Une préparation se vend « 180 € + 40 €/heure, examen compris ».
 *
 * Les 180 €, c'est la PART EXAMEN, au tarif préférentiel stagiaire (185 € quand
 * l'examen est acheté seul). Conséquence qui ne se devine pas : **quand une
 * préparation est commandée, l'examen TEF IRN n'est pas facturé en plus** — il est
 * dedans. Le facturer deux fois, c'est vendre deux fois la même épreuve.
 *
 * 3 h → 300 €, 6 h → 420 €, 9 h → 540 €, 12 h → 660 €.
 */
export const PREPARATION_PART_EXAMEN = 180;
export const PREPARATION_TAUX_HORAIRE = 40;

/**
 * À moins de 7 jours ouvrés, le surcoût porte sur la PART EXAMEN, pas sur les heures.
 *
 * Rouvrir une liste déjà arrêtée, prévenir la CCI, produire la convocation dans la
 * journée : c'est l'examen qui coûte plus cher (250 € au lieu de 180 €), soit +70 €.
 * Le coût d'une heure de cours, lui, ne dépend pas de la date où on la réserve.
 */
export const PREPARATION_SURCOUT_URGENCE =
  TARIFS_URGENCE.TEF_IRN - PREPARATION_PART_EXAMEN; // 250 − 180 = 70

/** La préparation se vend par demi-journées de 3 h : une matinée par tranche. */
export const HEURES_PAR_MATINEE = 3;

/** Les seules durées vendables en ligne. Hors de cette liste, on refuse. */
export const HEURES_AUTORISEES = [3, 6, 9, 12] as const;

/** Prix d'une préparation, examen compris. */
export function prixPreparation(heures: number, urgence: boolean): number {
  return (
    PREPARATION_PART_EXAMEN +
    heures * PREPARATION_TAUX_HORAIRE +
    (urgence ? PREPARATION_SURCOUT_URGENCE : 0)
  );
}

/** Nombre de matinées exigées pour une durée. 6 h → 2 matinées. */
export function nombreMatinees(heures: number): number {
  return Math.round(heures / HEURES_PAR_MATINEE);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES MATINÉES
   ───────────────────────────────────────────────────────────────────────────── */

/** Horaire unique d'une matinée de préparation. */
export const MATINEE_HORAIRE = "9 h 30 – 12 h 30";

/** Jours ouvrables d'une matinée (1 = lundi … 6 = samedi). Le dimanche est fermé. */
const JOURS_MATINEE = new Set([1, 2, 3, 4, 5, 6]);

/** Fenêtre, en jours calendaires, dans laquelle une matinée peut se placer. */
export const FENETRE_MATINEES_JOURS = 21;

/**
 * Combien de personnes dans une matinée de préparation.
 *
 * 15, décision du dirigeant du 09/10/2026 — c'est la capacité de la SALLE, pas une
 * règle commerciale. Elle change le jour où l'on change de salle, et c'est pour ça
 * qu'elle vit ici, en un seul endroit, et nulle part dans les routes.
 *
 * Avant cette date, il n'existait aucun contrôle : les matinées étaient simplement
 * déduites de la date d'examen, et rien n'empêchait trente personnes de réserver le
 * même samedi matin. On s'en serait aperçu le jour même, dans la salle.
 */
export const CAPACITE_MATINEE = 15;

/**
 * Combien de temps une matinée reste réservée SANS PAIEMENT.
 *
 * 09/10/2026 — défaut relevé en revue, et il était réel : les matinées étaient
 * réservées à la création de la commande, donc avant paiement, et ne se libéraient
 * qu'à l'expiration de la pré-inscription (J+3). Il suffisait donc de créer des
 * commandes jamais payées pour bloquer les 15 places d'un samedi matin — et sans
 * aucune malveillance, de simples abandons y suffisaient, puisque c'est le cas le
 * plus fréquent d'un tunnel d'achat.
 *
 * 30 minutes : de quoi finir un paiement par carte sans se presser, pas de quoi
 * stériliser une salle. Trois durées ont été pesées :
 *   — réserver seulement AU PAIEMENT : écarté, parce qu'un candidat pourrait payer
 *     puis se voir refuser sa matinée. Argent encaissé, pas de place : le pire des cas ;
 *   — J+3 (l'existant) : trop long pour une chaise de salle ;
 *   — 30 minutes : retenu.
 *
 * ⚠️ Un financement Lenbox peut dépasser 30 minutes (réponse bancaire, action du
 * client). La place peut donc avoir été reprise quand l'accord arrive : c'est pour ça
 * que `reassurerMatinees()` existe et qu'elle est appelée à la validation du paiement.
 * On ne convoque jamais quelqu'un sur une chaise qui n'existe plus sans le dire.
 */
export const RESERVATION_MINUTES = 30;

/**
 * Nombre de commandes impayées simultanées tolérées pour une même adresse e-mail.
 *
 * La péremption limite la durée de l'abus ; ce plafond en limite l'ampleur. Sans lui,
 * une boucle crée trente commandes en trente secondes et remplit la salle pour la
 * demi-heure qui vient. Trois : un candidat qui se trompe deux fois reste servi.
 */
export const COMMANDES_IMPAYEES_MAX_PAR_EMAIL = 3;

/**
 * Libère les réservations des commandes impayées trop vieilles.
 *
 * **Tiré, pas poussé** — même principe que `occupationDe()` pour les sessions d'examen :
 * personne ne balaie en tâche de fond, c'est la lecture suivante qui nettoie. Un cron
 * tournerait toutes les cinq minutes pour rien l'essentiel du temps, alors que la seule
 * fois où le compte doit être juste, c'est quand quelqu'un regarde.
 *
 * La péremption est MATÉRIALISÉE (`actif = false`) et non calculée à la lecture, et ce
 * n'est pas un détail : l'index d'unicité porte sur `(date, centre, place) where actif`.
 * Une réservation périmée restée `actif` continuerait d'interdire son numéro de place à
 * tout le monde — le compteur dirait « libre » et l'insertion échouerait quand même.
 */
export async function libererReservationsPerimees(): Promise<void> {
  const limite = new Date(Date.now() - RESERVATION_MINUTES * 60_000).toISOString();
  const { data: perimees } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("id")
    .eq("statut", "en_attente")
    .is("paye_le", null)
    .lt("cree_le", limite);

  const ids = (perimees ?? []).map((c: any) => String(c.id));
  if (!ids.length) return;

  await supabaseAdmin
    .from("matinees_preparation")
    .update({ actif: false })
    .in("commande_id", ids)
    .eq("actif", true);

  // La commande passe « expiree » : elle ne compte plus, et on voit dans le CRM que
  // ce n'est pas un abandon silencieux. Les pré-inscriptions, elles, gardent leur
  // propre cycle (relance J+1, expiration J+3) : on ne touche pas à l'existant.
  await supabaseAdmin
    .from("commandes_en_ligne")
    .update({ statut: "expiree" })
    .in("id", ids)
    .eq("statut", "en_attente")
    .is("paye_le", null);
}

/**
 * Centre où se tiennent les matinées.
 *
 * Rosny aujourd'hui — Rosny est le centre principal depuis le 03/09/2026. Volontairement
 * une variable et non une constante en dur dans les requêtes : Gagny et Sarcelles
 * ouvriront, et la capacité se compte PAR CENTRE (la même date peut être pleine à Rosny
 * et vide à Gagny).
 */
export const CENTRE_MATINEES_PAR_DEFAUT = "ROSNY";

export type Matinee = {
  /** AAAA-MM-JJ */
  iso: string;
  /** « lundi 12 octobre 2026 » */
  label: string;
  /** La matinée du jour de l'examen : l'argument de vente, dit en clair. */
  memeJour: boolean;
  /** Places encore libres dans cette matinée, sur CAPACITE_MATINEE. */
  restantes: number;
};

function isoParis(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/**
 * Les dates de matinée recevables pour un examen donné, sans tenir compte des places.
 *
 * On remonte 21 jours avant l'examen, on garde lundi → samedi, et on INCLUT le matin
 * de l'examen lui-même : l'épreuve est à 14 h, la préparation de 9 h 30 à 12 h 30 tient
 * dans la même journée, dans la salle de l'épreuve. C'est précisément ce qui se vend.
 *
 * Une matinée déjà commencée n'est pas proposée : on écarte le jour en cours dès 9 h 30
 * passées. Proposer un créneau qu'on ne peut plus honorer, c'est se préparer un appel
 * mécontent. Même algorithme que `matineesDisponibles()` du site : le site affiche, le
 * CRM arbitre, et les deux doivent tomber d'accord sur la liste.
 */
export function datesMatineesRecevables(dateExamenIso: string, maintenant = new Date()): string[] {
  const examen = new Date(`${dateExamenIso}T12:00:00`);
  const aujourdhui = isoParis(maintenant);
  /* « 14:05 » comparé en texte à « 09:30 » : l'ordre lexicographique d'un horaire à deux
     chiffres est l'ordre chronologique, et on évite une arithmétique de fuseau sur
     laquelle on se trompe une fois sur deux. */
  const heureParis = maintenant.toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris",
  });

  const liste: string[] = [];
  for (let recul = FENETRE_MATINEES_JOURS; recul >= 0; recul--) {
    const j = new Date(examen);
    j.setDate(j.getDate() - recul);
    if (!JOURS_MATINEE.has(j.getDay())) continue;
    const cle = isoParis(j);
    if (cle < aujourdhui) continue;
    if (cle === aujourdhui && heureParis >= "09:30") continue;
    liste.push(cle);
  }
  return liste;
}

/**
 * Combien de places sont déjà prises, pour chaque date demandée, dans un centre.
 *
 * Une place est « prise » dès qu'une commande la réserve, AVANT paiement — exactement
 * comme `lireSession` compte les pré-inscriptions « en_attente » pour les sièges
 * d'examen. Sans ça, deux candidats simultanés achètent la même chaise.
 *
 * Mais contrairement aux sièges d'examen, cette retenue est COURTE :
 * `RESERVATION_MINUTES`. Une commande abandonnée rend sa chaise au bout d'une
 * demi-heure, sans quoi il suffirait de commandes jamais payées pour stériliser un
 * samedi matin. Le nettoyage est fait ici même, juste avant de compter.
 */
export async function placesPrisesMatinees(
  dates: readonly string[], centre: string,
): Promise<Map<string, number>> {
  const prises = new Map<string, number>();
  if (dates.length === 0) return prises;
  // On nettoie AVANT de compter : sinon une salle paraît pleine de commandes mortes.
  await libererReservationsPerimees();
  const { data } = await supabaseAdmin
    .from("matinees_preparation")
    .select("date_matinee")
    .eq("centre", centre)
    .eq("actif", true) // une réservation abandonnée a rendu sa chaise
    .in("date_matinee", dates as string[]);
  for (const l of (data ?? []) as any[]) {
    const d = String(l.date_matinee);
    prises.set(d, (prises.get(d) ?? 0) + 1);
  }
  return prises;
}

/**
 * Réserve une chaise sur chaque matinée demandée. Tout ou rien.
 *
 * Le compte ne peut pas être tenu par un `count` suivi d'un `insert` : deux candidats
 * peuvent remplir la dernière place à la même seconde, et les deux passeraient. On prend
 * donc la plus petite place libre et on laisse l'index d'unicité trancher — si deux
 * requêtes visent la même chaise, PostgreSQL n'en accepte qu'une, et la seconde
 * recommence sur la place suivante. C'est le même principe que `occupationDe()` pour les
 * sessions d'examen : on refuse plutôt que de convoquer quelqu'un sur une place
 * inexistante.
 *
 * Si une seule matinée manque, on relâche TOUTES celles qu'on venait de prendre : une
 * préparation de 6 h avec une seule matinée n'existe pas, et laisser la moitié réservée
 * bloquerait une chaise pour personne.
 */
export async function reserverMatinees(
  commandeId: string, dates: readonly string[], centre: string,
  /**
   * `true` (défaut) : si une seule matinée manque, on relâche TOUTES celles qu'on
   * vient de prendre. `false` : on garde ce qui a pu être pris et on signale le reste.
   *
   * Le `false` sert à la REPRISE après paiement (`reassurerMatinees`). Y relâcher tout
   * serait destructeur : on jetterait les chaises intactes de la commande pour punir
   * celle qui manque, sur un dossier déjà encaissé.
   */
  toutOuRien = true,
): Promise<{ ok: boolean; pleines?: string[] }> {
  const pleines: string[] = [];
  // Idem avant d'écrire : la place qu'on s'apprête à prendre est peut-être retenue
  // par une commande abandonnée il y a une heure.
  await libererReservationsPerimees();

  for (const date of dates) {
    let pris = false;
    // Au plus CAPACITE_MATINEE tentatives : au-delà, la matinée est pleine pour de bon.
    for (let essai = 0; essai < CAPACITE_MATINEE && !pris; essai++) {
      const { data: occupees } = await supabaseAdmin
        .from("matinees_preparation")
        .select("place")
        .eq("centre", centre).eq("date_matinee", date).eq("actif", true);
      const prisesDejà = new Set((occupees ?? []).map((l: any) => Number(l.place)));
      if (prisesDejà.size >= CAPACITE_MATINEE) break;

      let place = 0;
      for (let n = 1; n <= CAPACITE_MATINEE; n++) {
        if (!prisesDejà.has(n)) { place = n; break; }
      }
      if (!place) break;

      const { error } = await supabaseAdmin
        .from("matinees_preparation")
        .insert({ commande_id: commandeId, date_matinee: date, centre, place });
      // 23505 = violation d'unicité : quelqu'un a pris cette chaise entre notre lecture
      // et notre écriture. Ce n'est pas une anomalie, c'est la course qu'on attendait.
      if (!error) pris = true;
      else if ((error as any).code !== "23505") break;
    }
    if (!pris) pleines.push(date);
  }

  if (pleines.length) {
    if (toutOuRien) await libererMatinees(commandeId);
    return { ok: false, pleines };
  }
  return { ok: true };
}

/**
 * Au moment du paiement : vérifie que la commande a TOUJOURS ses chaises, et les
 * reprend si la péremption les a rendues entre-temps.
 *
 * Nécessaire parce qu'un financement Lenbox peut dépasser `RESERVATION_MINUTES` :
 * réponse bancaire, action demandée au client… L'accord peut donc arriver après que la
 * place a été libérée, voire reprise par quelqu'un d'autre.
 *
 * Trois cas, et aucun ne doit être silencieux :
 *   — les réservations sont intactes → rien à faire ;
 *   — elles étaient périmées mais les places sont libres → on les reprend ;
 *   — une place a été prise par un autre → on renvoie la liste. L'argent est encaissé,
 *     on ne refuse donc pas la commande : on alerte pour qu'un humain replace le
 *     candidat. Convoquer quelqu'un sur une chaise qui n'existe plus, sans le dire,
 *     serait le découvrir le samedi matin dans la salle.
 */
export async function reassurerMatinees(
  commandeId: string, dates: readonly string[], centre: string,
): Promise<{ ok: boolean; perdues?: string[] }> {
  if (!dates.length) return { ok: true };

  const { data: vives } = await supabaseAdmin
    .from("matinees_preparation")
    .select("date_matinee")
    .eq("commande_id", commandeId)
    .eq("actif", true);
  const tenues = new Set((vives ?? []).map((l: any) => String(l.date_matinee)));

  const aReprendre = dates.filter((d) => !tenues.has(d));
  if (!aReprendre.length) return { ok: true };

  const r = await reserverMatinees(commandeId, aReprendre, centre, false);
  if (r.ok) return { ok: true };
  return { ok: false, perdues: r.pleines };
}

/** Rend les chaises d'une commande. Jamais de DELETE : on désactive (règle MYSTORY). */
export async function libererMatinees(commandeId: string): Promise<void> {
  await supabaseAdmin
    .from("matinees_preparation")
    .update({ actif: false })
    .eq("commande_id", commandeId);
}

/** Les matinées proposables, places comprises. Une matinée pleine reste dans la liste. */
export async function matineesDisponibles(
  dateExamenIso: string, centre = CENTRE_MATINEES_PAR_DEFAUT, maintenant = new Date(),
): Promise<Matinee[]> {
  const dates = datesMatineesRecevables(dateExamenIso, maintenant);
  const prises = await placesPrisesMatinees(dates, centre);
  return dates.map((iso) => ({
    iso,
    label: jourLisible(iso),
    memeJour: iso === dateExamenIso,
    restantes: Math.max(0, CAPACITE_MATINEE - (prises.get(iso) ?? 0)),
  }));
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES PLATEFORMES D'ENTRAÎNEMENT
   ───────────────────────────────────────────────────────────────────────────── */

export type ClePlateforme = "passetontef" | "prepmyfuture" | "prepcivique";

/**
 * Le prix des plateformes n'est écrit nulle part : il se DÉDUIT des packs publiés
 * sur le site (`EXAMEN_CIVIQUE_PRICING`). Déduction refaite ici à la main, et vérifiée
 * par deux chemins indépendants pour PrepCivique :
 *
 *   PasseTonTEF  = 220 − 185 (TEF IRN seul)                       = 35 €
 *   PrepMyFuture = 250 − 185                                      = 65 €
 *   PrepCivique  = 320 − 265 (pack 2 examens) − 35 (PasseTonTEF)  = 20 €
 *            et  = 350 − 265 − 65 (PrepMyFuture)                  = 20 €   ✔ concordant
 *
 * Les deux chemins donnent 20 € : on n'invente rien. Le pack « 2 examens » à 265 €
 * n'est d'ailleurs pas une remise — 185 + 80 = 265 au centime — ce qui explique
 * pourquoi la soustraction tombe juste.
 *
 * ⚠️ `PLATEFORMES` de `tarifsExamen.ts` annonce Passetontef à 15 € : c'est un reliquat,
 * cette table n'est appelée par AUCUN appelant (l'inscription à une session passe
 * `[]`). On ne la corrige pas ici pour ne pas changer le comportement d'un fichier
 * partagé — l'écart 15 ≠ 35 est signalé à la direction, qui tranchera.
 *
 * `sousType` reprend VERBATIM les libellés de `PLATEFORMES` dans `lib/examens.ts` :
 * c'est la valeur que la conversion inscrit dans `ventes_examen.sous_type`, et elle
 * est validée telle quelle à la saisie interne.
 */
export const PLATEFORMES_COMMANDE: Record<
  ClePlateforme, { libelle: string; prix: number; sousType: string; pour: TypeExamen }
> = {
  passetontef: { libelle: "Plateforme PasseTonTEF", prix: 35, sousType: "Passetontef", pour: "TEF_IRN" },
  prepmyfuture: { libelle: "Plateforme PrepMyFuture", prix: 65, sousType: "Prepmyfuture", pour: "TEF_IRN" },
  prepcivique: { libelle: "Plateforme PrepCivique", prix: 20, sousType: "Prepcivique", pour: "Examen_civique" },
};

function estClePlateforme(v: string): v is ClePlateforme {
  return Object.prototype.hasOwnProperty.call(PLATEFORMES_COMMANDE, v);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES MENTIONS DE L'EXAMEN CIVIQUE
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Le site envoie un code (CSP / CR / NAT), le CRM stocke le libellé.
 *
 * Les libellés sont ceux de `MENTIONS_CIVIQUE` (`lib/inscriptionEnLigne.ts`), et c'est
 * `sous_type` qui part en facture et en convocation : on ne les reformule pas.
 */
export const MENTIONS_PAR_CODE: Record<string, string> = {
  CSP: "Carte de séjour pluriannuelle",
  CR: "Carte de résident",
  NAT: "Naturalisation",
};

/* ─────────────────────────────────────────────────────────────────────────────
   LA COMMANDE : LECTURE, CONTRÔLES, DEVIS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Une ligne du devis, telle qu'elle sera facturée.
 *
 * `ligne` dit à quel objet du CRM la ligne donnera naissance à la conversion :
 *   — "examen"     → une pré-inscription d'examen (attestation + convocation + facture) ;
 *   — "plateforme" → une pré-inscription « Vente_plateforme » ;
 *   — "preparation"→ les HEURES de cours, qu'aucune conversion ne sait traiter aujourd'hui
 *                    (voir le compte rendu : décision en attente du dirigeant).
 */
export type LigneCommande = {
  ligne: "examen" | "preparation" | "plateforme";
  libelle: string;
  prix: number;
  /** Renseigné pour "examen" et "plateforme" : ce qui part dans la pré-inscription. */
  typeExamen?: TypeExamen | "Vente_plateforme";
  sousType?: string | null;
  sessionId?: string | null;
  urgence?: boolean;
};

export type Commande = {
  tef: SessionPublique | null;
  civique: SessionPublique | null;
  /** Libellé de la mention, jamais le code. Null si pas de civique. */
  mention: string | null;
  heures: number;
  matinees: string[];
  options: ClePlateforme[];
  centreMatinees: string;
  lignes: LigneCommande[];
  montant: number;
  urgence: boolean;
};

/**
 * Le résultat d'une lecture de commande.
 *
 * Volontairement UN SEUL objet à champs optionnels, et non une union discriminée : ce
 * dépôt compile avec `strict: false`, donc sans `strictNullChecks`, et TypeScript n'y
 * réduit PAS une union sur son discriminant — `if (!lu.ok)` ne fait rien gagner et le
 * compilateur refuse `lu.erreurs`. Mieux vaut une forme qui dit la vérité sur ce que le
 * compilateur sait faire ici qu'une élégance qui ne passe pas.
 */
export type LectureCommande = {
  ok: boolean;
  /** Renseigné si `ok`. */
  commande?: Commande;
  /** Renseignés si `!ok`. */
  erreurs?: string[];
  statut?: number;
};

/** Paramètres bruts, tels qu'ils arrivent de l'URL ou du formulaire. */
export type ParamsCommande = {
  session?: string | null;
  session_civique?: string | null;
  mention?: string | null;
  preparation?: string | null;
  matinees?: string | null;
  options?: string | null;
};

const TEL = "06 81 43 16 54";

/**
 * Lit et VALIDE une commande, puis en calcule le montant. Seule source du prix encaissé.
 *
 * Tout échoue fermé : à la moindre incohérence on refuse et on explique, plutôt que de
 * deviner. Un devis approximatif sur une commande qu'on ne comprend pas, c'est un litige
 * le matin où le candidat se présente.
 *
 * Les contrôles, dans l'ordre :
 *   1. au moins un examen commandé ;
 *   2. sessions existantes, ouvertes, à venir et PAS COMPLÈTES (`lireSession` s'en charge,
 *      occupation réelle comprise) ;
 *   3. mention obligatoire dès que le civique est commandé ;
 *   4. 🔴 AUCUNE matinée avec l'examen civique seul (ligne rouge réglementaire, ci-dessous) ;
 *   5. durée de préparation dans la liste, et exactement `heures / 3` matinées distinctes ;
 *   6. chaque matinée tombe un lundi → samedi dans les 21 jours précédant l'examen,
 *      matin de l'examen inclus, et il y reste de la place ;
 *   7. options connues, et cohérentes avec les examens commandés.
 */
export async function lireCommande(
  p: ParamsCommande, maintenant = new Date(),
): Promise<LectureCommande> {
  const erreurs: string[] = [];

  const idTef = String(p.session ?? "").trim();
  const idCivique = String(p.session_civique ?? "").trim();
  if (!idTef && !idCivique) {
    return {
      ok: false, statut: 400,
      erreurs: ["Aucun examen n'est sélectionné. Repartez du calendrier des sessions."],
    };
  }

  const [tef, civique] = await Promise.all([
    idTef ? lireSession(idTef) : Promise.resolve(null),
    idCivique ? lireSession(idCivique) : Promise.resolve(null),
  ]);

  // `lireSession` renvoie null pour « inexistante », « fermée », « passée » ET « complète ».
  // On ne distingue pas : dans tous les cas la réponse utile est « choisissez une autre date ».
  if (idTef && !tef) {
    erreurs.push("La session de TEF IRN choisie n'est plus disponible (complète ou fermée).");
  }
  if (idCivique && !civique) {
    erreurs.push("La session d'examen civique choisie n'est plus disponible (complète ou fermée).");
  }
  // Une session ne doit pas non plus être du mauvais type : un identifiant de session
  // civique passé en `session=` aurait fait facturer un TEF IRN à 185 € pour un civique.
  if (tef && tef.type !== "TEF_IRN") erreurs.push("La session indiquée n'est pas une session de TEF IRN.");
  if (civique && civique.type !== "Examen_civique") {
    erreurs.push("La session indiquée n'est pas une session d'examen civique.");
  }
  if (erreurs.length) return { ok: false, erreurs, statut: 409 };

  // 3. La mention est obligatoire dès que le civique est commandé : elle détermine
  //    l'épreuve passée (CSP / CR / NAT), elle ne se choisit pas après coup.
  let mention: string | null = null;
  if (civique) {
    const code = String(p.mention ?? "").trim().toUpperCase();
    mention = MENTIONS_PAR_CODE[code] ?? null;
    if (!mention) {
      erreurs.push("La mention de l'examen civique est obligatoire : carte de séjour pluriannuelle, carte de résident ou naturalisation.");
    }
  }

  // 5. Durée de préparation.
  const brutHeures = String(p.preparation ?? "").trim();
  const heures = brutHeures ? Number(brutHeures) : 0;
  const matinees = String(p.matinees ?? "")
    .split(",").map((d) => d.trim()).filter(Boolean);

  if (brutHeures && !(HEURES_AUTORISEES as readonly number[]).includes(heures)) {
    erreurs.push("Durée de préparation non proposée : 3, 6, 9 ou 12 heures.");
  }

  /* 4. 🔴 LIGNE ROUGE — aucune préparation avec l'examen civique SEUL.
   *
   * MYSTORY ne dispense AUCUNE formation civique : le Contrat d'intégration républicaine
   * est délivré exclusivement par l'OFII. Nous faisons PASSER l'examen civique, nous ne
   * le préparons pas. Ce refus est réglementaire, pas commercial — il ne s'assouplit pas
   * pour conclure une vente, et il ne se contourne pas en appelant la matinée autrement.
   * Les matinées de préparation n'existent que pour le TEF IRN.
   */
  if (heures > 0 && !tef) {
    return {
      ok: false, statut: 400,
      erreurs: [
        "Nous ne proposons aucune matinée de préparation à l'examen civique : la formation civique est délivrée exclusivement par l'OFII, dans le cadre du contrat d'intégration républicaine. Nous faisons passer l'examen, nous ne le préparons pas.",
      ],
    };
  }
  if (heures === 0 && matinees.length > 0) {
    erreurs.push("Des matinées sont indiquées sans durée de préparation.");
  }

  // 6. Les matinées : nombre exact, dates recevables, places restantes.
  const centreMatinees = tef ? tef.centre.toUpperCase() || CENTRE_MATINEES_PAR_DEFAUT : CENTRE_MATINEES_PAR_DEFAUT;
  if (heures > 0 && tef && erreurs.length === 0) {
    const attendu = nombreMatinees(heures);
    const uniques = Array.from(new Set(matinees));
    if (uniques.length !== matinees.length) {
      erreurs.push("La même matinée est sélectionnée deux fois.");
    } else if (uniques.length !== attendu) {
      erreurs.push(
        `Une préparation de ${heures} h se compose de ${attendu} matinée${attendu > 1 ? "s" : ""} de 3 h : ` +
        `${uniques.length} ${uniques.length > 1 ? "ont" : "a"} été transmise${uniques.length > 1 ? "s" : ""}.`,
      );
    } else {
      const recevables = new Set(datesMatineesRecevables(tef.date_examen, maintenant));
      const horsFenetre = uniques.filter((d) => !recevables.has(d));
      if (horsFenetre.length) {
        erreurs.push(
          `Ces matinées ne sont pas proposables pour cet examen : ${horsFenetre.join(", ")}. ` +
          `Une matinée se tient du lundi au samedi, de ${MATINEE_HORAIRE}, dans les ${FENETRE_MATINEES_JOURS} jours qui précèdent l'examen (le matin de l'examen compris).`,
        );
      } else {
        // Les places : on RECOMPTE ici, et on recomptera encore à l'insertion. Entre
        // l'affichage de la page et l'envoi du formulaire, la dernière chaise a pu partir.
        const prises = await placesPrisesMatinees(uniques, centreMatinees);
        const pleines = uniques.filter((d) => (prises.get(d) ?? 0) >= CAPACITE_MATINEE);
        if (pleines.length) {
          erreurs.push(
            `Ces matinées sont complètes (${CAPACITE_MATINEE} personnes maximum) : ` +
            `${pleines.map(jourLisible).join(" · ")}. Choisissez une autre matinée, ou appelez-nous au ${TEL}.`,
          );
        }
      }
    }
  }

  // 7. Les options.
  const options: ClePlateforme[] = [];
  for (const brut of String(p.options ?? "").split(",").map((o) => o.trim().toLowerCase()).filter(Boolean)) {
    if (!estClePlateforme(brut)) {
      erreurs.push(`Option inconnue : ${brut}.`);
      continue;
    }
    if (options.includes(brut)) continue; // doublon : sans effet, on ne facture pas deux fois
    const pl = PLATEFORMES_COMMANDE[brut];
    // Une plateforme d'entraînement sans l'examen qu'elle prépare n'a pas de sens, et
    // surtout : la conversion la rattacherait à un candidat sans épreuve correspondante.
    if (pl.pour === "TEF_IRN" && !tef) {
      erreurs.push(`${pl.libelle} prépare le TEF IRN : elle suppose un examen TEF IRN dans la commande.`);
      continue;
    }
    if (pl.pour === "Examen_civique" && !civique) {
      erreurs.push(`${pl.libelle} prépare l'examen civique : elle suppose un examen civique dans la commande.`);
      continue;
    }
    options.push(brut);
  }

  if (erreurs.length) return { ok: false, erreurs, statut: 400 };

  /* ── LE DEVIS ──────────────────────────────────────────────────────────────
   * Le tarif d'urgence s'apprécie session par session : chaque examen part à SON
   * tarif publié. On n'invente pas un « pack urgent » dont le prix n'a jamais été
   * arrêté, et on n'applique pas l'urgence d'une date à l'autre.
   */
  const tefUrgent = tef ? joursOuvresAvant(tef.date_examen) < DELAI_TARIF_PUBLIC_JOURS_OUVRES : false;
  const civiqueUrgent = civique
    ? joursOuvresAvant(civique.date_examen) < DELAI_TARIF_PUBLIC_JOURS_OUVRES : false;

  const lignes: LigneCommande[] = [];

  if (tef && heures > 0) {
    /* Préparation : l'examen TEF IRN est DEDANS, il n'a pas de ligne à lui.
     *
     * Le montant se scinde quand même en deux pour la facturation, parce que les deux
     * moitiés ne donnent pas naissance au même objet : la part examen (180 €, ou 250 €
     * en urgence) devient une inscription à l'examen — donc une convocation et une
     * attestation — et les heures de cours restent une prestation de formation. Le
     * candidat, lui, voit une seule ligne et un seul prix. */
    const partExamen = tefUrgent ? TARIFS_URGENCE.TEF_IRN : PREPARATION_PART_EXAMEN;
    const partHeures = heures * PREPARATION_TAUX_HORAIRE;
    const nb = nombreMatinees(heures);
    lignes.push({
      ligne: "examen",
      libelle: `Examen TEF IRN — ${jourLisible(tef.date_examen)}, ${tef.horaire}` +
        (tefUrgent ? " (tarif d'urgence)" : "") + " · compris dans la préparation",
      prix: partExamen,
      typeExamen: "TEF_IRN",
      sousType: null,
      sessionId: tef.id,
      urgence: tefUrgent,
    });
    lignes.push({
      ligne: "preparation",
      libelle: `Préparation ${heures} h — ${nb} matinée${nb > 1 ? "s" : ""} de 3 h (${MATINEE_HORAIRE})`,
      prix: partHeures,
    });
    // Garde-fou arithmétique : la somme des deux parts DOIT faire le prix annoncé par
    // la grille publique. Si elle divergeait, c'est qu'un des deux barèmes a bougé seul.
    const attendu = prixPreparation(heures, tefUrgent);
    if (partExamen + partHeures !== attendu) {
      return {
        ok: false, statut: 500,
        erreurs: [`Incohérence de barème sur la préparation (${partExamen + partHeures} € calculés contre ${attendu} € attendus). Appelez-nous au ${TEL}.`],
      };
    }
  } else if (tef) {
    lignes.push({
      ligne: "examen",
      libelle: `Examen TEF IRN — ${jourLisible(tef.date_examen)}, ${tef.horaire}` +
        (tefUrgent ? " (tarif d'urgence)" : ""),
      prix: tefUrgent ? TARIFS_URGENCE.TEF_IRN : TARIFS_PUBLICS.TEF_IRN,
      typeExamen: "TEF_IRN",
      sousType: null,
      sessionId: tef.id,
      urgence: tefUrgent,
    });
  }

  if (civique) {
    lignes.push({
      ligne: "examen",
      libelle: `Examen civique — mention ${mention} — ${jourLisible(civique.date_examen)}, ${civique.horaire}` +
        (civiqueUrgent ? " (tarif d'urgence)" : ""),
      prix: civiqueUrgent ? TARIFS_URGENCE.Examen_civique : TARIFS_PUBLICS.Examen_civique,
      typeExamen: "Examen_civique",
      sousType: mention,
      sessionId: civique.id,
      urgence: civiqueUrgent,
    });
  }

  for (const cle of options) {
    const pl = PLATEFORMES_COMMANDE[cle];
    lignes.push({
      ligne: "plateforme",
      libelle: pl.libelle,
      prix: pl.prix,
      typeExamen: "Vente_plateforme",
      sousType: pl.sousType,
      sessionId: null,
    });
  }

  return {
    ok: true,
    commande: {
      tef, civique, mention,
      heures, matinees: Array.from(new Set(matinees)),
      options, centreMatinees, lignes,
      montant: lignes.reduce((n, l) => n + l.prix, 0),
      urgence: tefUrgent || civiqueUrgent,
    },
  };
}

/**
 * La plus proche des dates d'examen de la commande.
 *
 * C'est elle qui décide de l'éligibilité au paiement fractionné : le délai légal de
 * rétractation de 14 jours doit être écoulé AVANT la première épreuve, sinon le candidat
 * peut la passer puis se rétracter. Avec deux examens, c'est donc le plus tôt qui
 * contraint, pas le plus tard.
 */
export function dateExamenLaPlusProche(c: Commande): string | null {
  const dates = [c.tef?.date_examen, c.civique?.date_examen].filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.sort()[0]; // AAAA-MM-JJ : l'ordre lexicographique est l'ordre chronologique
}

/** Les paramètres d'une commande, relus depuis la ligne enregistrée en base. */
export function paramsDepuisLigne(c: any): ParamsCommande {
  const codeMention = Object.keys(MENTIONS_PAR_CODE)
    .find((k) => MENTIONS_PAR_CODE[k] === c?.mention) ?? null;
  return {
    session: c?.session_tef_id ?? null,
    session_civique: c?.session_civique_id ?? null,
    mention: codeMention,
    preparation: c?.preparation_heures ? String(c.preparation_heures) : null,
    matinees: Array.isArray(c?.matinees) ? c.matinees.join(",") : null,
    options: Array.isArray(c?.options) ? c.options.join(",") : null,
  };
}

/** Résumé d'une commande en texte, pour un e-mail ou une alerte. */
export function resumeCommande(c: Commande): string {
  const l = c.lignes.map((x) => `· ${x.libelle} — ${x.prix.toFixed(2)} €`);
  if (c.matinees.length) {
    l.push(`Matinées retenues (${MATINEE_HORAIRE}, ${c.centreMatinees}) : ${c.matinees.map(jourLisible).join(" · ")}`);
  }
  l.push(`Total : ${c.montant.toFixed(2)} €`);
  return l.join("\n");
}
