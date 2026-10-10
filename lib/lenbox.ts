/**
 * MYSTORY — Lenbox : paiement fractionné (3, 4 ou 10 fois), et sa relecture.
 *
 * 09/10/2026. Lenbox est EN PRODUCTION — deux dossiers financés le 07/10 — mais
 * totalement déconnecté : le champ « URL de webhook » du tableau de bord est vide,
 * l'historique des webhooks aussi. Quand un dossier passe à « financé », rien n'en
 * informe le CRM : les deux dossiers du 07/10 ont été saisis à la main.
 *
 * Ce fichier porte la grille (échéanciers, frais, bornes) et les appels dont
 * `POST /api/paiements/lenbox` a besoin. Trois variables d'environnement rendent
 * l'option vivante : LENBOX_AGENCY_ID, LENBOX_EMAIL, LENBOX_PASSWORD. Tant qu'il en
 * manque une, `lenboxPret()` renvoie false et l'option ne s'affiche tout simplement
 * pas — pas de bouton mort. Aucune de ces valeurs n'apparaît dans ce dépôt.
 *
 * ── LA SOURCE DE VÉRITÉ : LE SCHÉMA OPENAPI, PAS LA DOCUMENTATION ───────────
 * Tout ce fichier est aligné sur le schéma officiel, relevé le 09/10/2026 :
 *   https://dashboard-api.lenbox.io/api/schema/?format=json
 *
 * Il est généré depuis leur code : il ne ment pas. La documentation rédigée, elle,
 * s'est révélée fausse sur plusieurs points qui comptent — et une première version
 * de ce fichier en avait hérité :
 *
 *   • la relecture d'un dossier n'est PAS `GET /api/demandes/<id>/` (chemin deviné,
 *     inexistant) mais `GET /api/agencies/{agence_id}/demandes/{demande_id}/status/` ;
 *   • l'authentification existe bel et bien : jeton JWT obtenu sur `/api/token/`
 *     avec un COUPLE E-MAIL / MOT DE PASSE (et non client_id/client_secret), à
 *     présenter en `Authorization: Bearer` sur TOUS les appels, création comprise ;
 *   • les statuts sont au nombre de HUIT, pas quatre ;
 *   • `civilite` est une énumération `MR` / `MME` / `MLE` : envoyer « Madame » fait
 *     refuser la requête ;
 *   • la réponse de statut NE PORTE AUCUN MONTANT (voir `lireSessionLenbox`).
 *
 * En cas de doute sur un champ : relire le schéma, pas la page rédigée.
 *
 * ── LE PIÈGE LE PLUS COÛTEUX ────────────────────────────────────────────────
 * `requested_amount` est un ENTIER en CENTIMES (confirmé par le schéma : `integer`),
 * alors que le widget attend des euros. Facteur 100. Un oubli encaisse 6,60 € pour
 * une préparation à 660 €, ou en demande 66 000 €. On convertit DANS ce fichier, à
 * un seul endroit, et jamais dans une route.
 *
 * ── CE QU'ON NE FAIT PAS ────────────────────────────────────────────────────
 * Jamais de fractionné sur un parcours financé par le CPF : c'est la Caisse des
 * dépôts qui paie, pas le candidat. `/commande` est un chemin de vente directe
 * (hors CPF par construction) — si un jour une commande devait porter un
 * financement CPF, le fractionné doit disparaître de la page, pas être « adapté ».
 */

const BASE = "https://dashboard-api.lenbox.io/api";

/**
 * L'option n'existe que si l'agence ET les identifiants d'API sont configurés.
 *
 * Les trois variables sont posées dans Vercel par le dirigeant : LENBOX_AGENCY_ID,
 * LENBOX_EMAIL, LENBOX_PASSWORD. Tant qu'il en manque une, la page de commande
 * n'affiche tout simplement pas le fractionné — pas de bouton mort.
 *
 * 09/10/2026 — on n'exige plus que l'IDENTIFIANT D'AGENCE. On exigeait aussi le
 * couple e-mail / mot de passe « parce que sans jeton la création de session
 * échouerait » : c'était faux, mesuré contre l'API de production — la création se
 * fait avec le seul `agency_id`. Exiger des identifiants inutiles ne protégeait de
 * rien et masquait le vrai défaut. Ils restent utilisés par les relectures.
 */
export function lenboxPret(): boolean {
  return !!process.env.LENBOX_AGENCY_ID?.trim();
}

/** Un dossier de test ne doit jamais valider une inscription en production. */
export function lenboxEnTest(): boolean {
  return String(process.env.LENBOX_TEST ?? "").trim() === "1";
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA GRILLE
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * À partir de quel total on propose le fractionné. 400 €, décision du dirigeant
 * du 09/10/2026 : en dessous, la mensualité est si faible que l'option ajoute une
 * décision au candidat sans lui rendre service.
 */
export const SEUIL_FRACTIONNE = 400;

/** Bornes CBNX du produit Lenbox. Hors de cet intervalle, aucun dossier n'est finançable. */
export const MONTANT_MIN = 50;
export const MONTANT_MAX = 4500;

/**
 * Les trois échéanciers retenus : 3, 4 et 10 fois, FRAIS PARTAGÉS.
 *
 * Taux relevés dans le simulateur du compte MYSTORY le 09/10/2026, vérifiés sur
 * deux montants : 1,59 % de frais client en 3 fois, 2,40 % en 4 fois. Ce sont des
 * frais CLIENT — ils s'ajoutent à ce que paie le candidat, et c'est pour ça qu'on
 * ne peut JAMAIS annoncer `total / 4` : sur 420 €, cela donnerait 105 € là où le
 * candidat paiera 107,52 €. Annoncer un prix qu'on ne prélèvera pas, c'est le
 * genre d'écart qui finit en réclamation.
 *
 * ⚠️ Le 10 fois est retenu par le dirigeant malgré ses 7 % de frais client : c'est
 * SON arbitrage, pas une omission. Il n'est pas écarté « parce que c'est cher » —
 * un candidat qui ne peut pas payer 660 € d'un coup préfère 10 × 70,62 € à rien.
 *
 * ✔ Les trois codes sont CONFIRMÉS par `PaymentOptionsEnum` du schéma OpenAPI
 * (FLOA_3XP, FLOA_4XP, FLOA_10XP existent bien). Le suffixe `P` désigne les frais
 * PARTAGÉS ; les variantes `…XG` existent aussi et ne sont pas celles retenues.
 */
/**
 * 🔀 QUI PAIE LES FRAIS DE FINANCEMENT — l'interrupteur, et il n'y en a qu'un.
 *
 * Décision du dirigeant le 09/10/2026 au soir : passer aux variantes où MYSTORY paie,
 * pour que le « 2, 3 ou 4 fois SANS FRAIS » promis à l'article 5.2 des CGV devienne
 * vrai. Aujourd'hui les CGV promettent « sans frais » et le client paie 1,59 % à 7 % :
 * c'est cette contradiction qu'on ferme.
 *
 * Le suffixe du code FLOA porte cette information :
 *   — `…XP` : frais PARTAGÉS, le client paie un pourcentage (ce qui est en service) ;
 *   — `…XG` : frais à la charge du MARCHAND, le client paie le prix affiché, point.
 *
 * ⚠️ RESTE À FAIRE AVANT DE BASCULER — deux faits que seul Lenbox peut donner, et
 * qu'on ne devine pas :
 *   1. les codes `…XG` sont-ils ACTIVÉS sur le compte MYSTORY ? Ils existent dans
 *      `PaymentOptionsEnum` du schéma OpenAPI, ce qui ne veut pas dire qu'ils sont
 *      ouverts pour nous. L'API n'expose aucun endpoint qui liste les options
 *      autorisées : la seule vérification est d'ouvrir une session d'essai.
 *   2. quelle COMMISSION MARCHAND s'applique alors ? Elle n'est écrite nulle part de
 *      notre côté. Basculer sans la connaître, c'est changer sa marge à l'aveugle.
 *
 * Quand les deux réponses sont là : passer `FRAIS_A_LA_CHARGE_DU_CLIENT` à false.
 * Tout le reste — codes envoyés, mensualités affichées, règle des 14 jours — en
 * découle. Rien d'autre n'est à modifier, et c'est le but de cette constante.
 */
export const FRAIS_A_LA_CHARGE_DU_CLIENT = false;

/**
 * ⚠️ Les taux ci-dessous sont ceux du client. En variante `…XG` ils tombent à zéro :
 * c'est le marchand qui est débité, et le candidat paie exactement le prix affiché.
 */
const ECHEANCIERS_FRAIS_CLIENT = [
  { code: "FLOA_3XP", fois: 3, tauxClient: 0.0159, libelle: "3 fois" },
  { code: "FLOA_4XP", fois: 4, tauxClient: 0.024, libelle: "4 fois" },
  { code: "FLOA_10XP", fois: 10, tauxClient: 0.07, libelle: "10 fois" },
] as const;

const ECHEANCIERS_FRAIS_MARCHAND = [
  { code: "FLOA_3XG", fois: 3, tauxClient: 0, libelle: "3 fois" },
  { code: "FLOA_4XG", fois: 4, tauxClient: 0, libelle: "4 fois" },
  { code: "FLOA_10XG", fois: 10, tauxClient: 0, libelle: "10 fois" },
] as const;

export const ECHEANCIERS: readonly {
  code: string; fois: number; tauxClient: number; libelle: string;
}[] = FRAIS_A_LA_CHARGE_DU_CLIENT ? ECHEANCIERS_FRAIS_CLIENT : ECHEANCIERS_FRAIS_MARCHAND;

/**
 * 🔴 DÉLAI DE RÉTRACTATION — 14 jours CALENDAIRES, et c'est ce qui interdit le
 *    fractionné sur une session proche.
 *
 * Un financement fractionné est un contrat de crédit : le client dispose d'un délai
 * légal de rétractation de 14 jours. Si l'examen a lieu avant la fin de ce délai, le
 * candidat peut PASSER L'ÉPREUVE PUIS SE RÉTRACTER — service rendu, financement
 * annulé, et c'est nous qui perdons. Le fractionné n'est donc proposé que si la
 * session la plus proche de la commande est à PLUS de 14 jours.
 *
 * ⚠️ TROIS DÉLAIS COEXISTENT DANS CE DOSSIER, ET ILS NE SE COMPTENT PAS PAREIL.
 *    Ne pas les confondre, c'est la confusion la plus probable de tout ce code :
 *
 *    ┌ 14 jours CALENDAIRES ─ rétractation du crédit ─ ICI, `joursCalendairesAvant`
 *    ├  7 jours OUVRÉS ────── tarif d'urgence ─────── lib/tarifsExamen.ts,
 *    │                                                `joursOuvresAvant` (week-ends exclus)
 *    └ 20 jours ───────────── carence entre deux passages du TEF ─ lib/examenCarence.ts
 *
 * Compter la rétractation en jours ouvrés donnerait 18 à 20 jours calendaires et
 * refuserait le fractionné à des candidats qui y ont droit ; compter l'urgence en
 * calendaires ferait payer 185 € une inscription qui relève des 250 €.
 */
export const DELAI_RETRACTATION_JOURS = 14;

/** Jours CALENDAIRES entre aujourd'hui (Paris) et une date. Une date passée renvoie 0. */
export function joursCalendairesAvant(dateIso: string): number {
  const cible = new Date(`${dateIso}T00:00:00`);
  const jour = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  jour.setHours(0, 0, 0, 0);
  cible.setHours(0, 0, 0, 0);
  const n = Math.round((cible.getTime() - jour.getTime()) / 86_400_000);
  return n > 0 ? n : 0;
}

/**
 * Frais VENDEUR : 2,20 %, prélevés sur ce que MYSTORY reçoit.
 *
 * Ils n'entrent pas dans le prix du candidat — ils entrent dans la marge. Noté ici
 * pour qu'on sache, en lisant le compte Qonto, pourquoi un dossier de 660 € arrive
 * à 645,48 € et qu'il ne manque rien.
 */
export const FRAIS_VENDEUR = 0.022;

export type Echeancier = {
  code: string;
  fois: number;
  libelle: string;
  /** Taux de frais SUPPORTÉ PAR LE CLIENT. Zéro = variante `…XG`, frais marchand —
      et c'est ce zéro qui fait sortir le 3×/4× du régime du crédit. */
  tauxClient: number;
  /** Ce que le candidat paiera au total, frais client compris. */
  totalClient: number;
  /** La mensualité, frais compris. C'est CE chiffre qu'on affiche. */
  mensualite: number;
  /** Dernière échéance, qui absorbe l'arrondi au centime. */
  derniere: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Les échéanciers proposables, et le MOTIF quand il n'y en a aucun.
 *
 * Le motif n'est pas décoratif : quand on écarte le fractionné parce que la session
 * est trop proche, il faut le DIRE au candidat. Faire disparaître l'option en silence
 * laisse croire qu'elle n'existe pas ; l'expliquer en fait un argument pour réserver
 * plus tôt. C'est la différence entre une contrainte subie et une contrainte utile.
 *
 * `dateExamenLaPlusProche` : la plus proche des dates de la commande. S'il y a deux
 * examens, c'est celle-là qui décide — le délai de rétractation doit être purgé AVANT
 * la première épreuve, sinon le candidat peut la passer puis se rétracter.
 */
export function fractionnePour(
  total: number, dateExamenLaPlusProche: string | null,
): {
  echeanciers: Echeancier[];
  motif: string | null;
  /** Vrai quand l'examen tombe dans les 14 jours : la vente à distance impose alors
      de recueillir la renonciation expresse de l'art. L. 221-25 avant d'encaisser. */
  renonciationRequise?: boolean;
  /** Jours calendaires avant l'examen, pour rédiger cette renonciation. */
  jours?: number;
} {
  if (!lenboxPret()) return { echeanciers: [], motif: null };

  if (!isFinite(total) || total < SEUIL_FRACTIONNE) {
    /* 09/10/2026 (soir) — ce cas renvoyait `motif: null`, avec pour commentaire
       « trop petit : inutile d'en parler ». Conséquence mesurée le jour même :
       sur une commande d'examen seul à 185 €, la page ne disait RIEN du
       fractionné, et le dirigeant lui-même en a conclu que Lenbox n'était pas
       en service. Un client en tire la même conclusion — sauf que lui ne
       revient pas le dire.

       On l'annonce donc, et on l'annonce comme une ouverture : le candidat qui
       hésite sur une préparation apprend ici qu'en l'ajoutant il peut étaler
       son règlement. C'est la seule phrase du tunnel qui transforme une règle
       invisible en information utile. */
    return {
      echeanciers: [],
      motif:
        `Il est proposé à partir de ${SEUIL_FRACTIONNE} € de commande. ` +
        `Votre total est de ${total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € : ` +
        `en ajoutant une préparation, vous pourriez régler en 3, 4 ou 10 fois.`,
    };
  }
  if (total < MONTANT_MIN || total > MONTANT_MAX) {
    return {
      echeanciers: [],
      motif: `Le paiement en plusieurs fois est possible de ${MONTANT_MIN} € à ${MONTANT_MAX} €.`,
    };
  }
  if (!dateExamenLaPlusProche) return { echeanciers: [], motif: null };

  const jours = joursCalendairesAvant(dateExamenLaPlusProche);
  if (jours > DELAI_RETRACTATION_JOURS) return { echeanciers: echeanciersPour(total), motif: null };

  /* ── SESSION PROCHE : seuls les échéanciers HORS RÉGIME DU CRÉDIT survivent ──────
   *
   * Décision du dirigeant, 09/10/2026 : « on applique cette règle, mais on dit bien
   * qu'en acceptant le paiement en 3 fois ou 4 fois, le client ne pourra pas se
   * rétracter si l'examen prévu est dans moins d'une semaine. »
   *
   * Le raisonnement : l'article L. 312-4 du code de la consommation EXCLUT du régime
   * du crédit à la consommation les financements remboursables en moins de trois mois
   * et assortis d'aucun intérêt ni frais pour l'emprunteur. Un 3× ou 4× dont MYSTORY
   * paie les frais n'est donc plus un crédit — et le délai de rétractation de 14 jours
   * du crédit ne s'applique plus. Le 10×, lui, dépasse trois mois : il reste un crédit
   * et reste refusé sur une session proche, quoi qu'il arrive.
   *
   * ⚠️ MAIS IL RESTE UN AUTRE DROIT DE RÉTRACTATION, ET CE N'EST PAS LE MÊME.
   * Sortir du régime du crédit ne supprime pas la rétractation de la VENTE À DISTANCE
   * (art. L. 221-18) : 14 jours sur l'achat du service lui-même, financé ou non. La
   * seule façon régulière de passer outre est prévue par l'art. L. 221-25 : le client
   * DEMANDE EXPRESSÉMENT l'exécution avant la fin du délai et RECONNAÎT qu'il perdra
   * son droit une fois la prestation pleinement exécutée. C'est une case à cocher
   * dédiée, jamais pré-cochée, dont le libellé est repris ci-dessous et confirmé sur
   * support durable. Afficher « vous ne pourrez pas vous rétracter » SANS recueillir
   * cette renonciation ne protège de rien : c'est la renonciation qui vaut, pas
   * l'avertissement.
   *
   * ⚠️ Tant que `FRAIS_A_LA_CHARGE_DU_CLIENT` vaut true, RIEN de tout cela ne
   * s'active : le client paie des frais, donc c'est un crédit, donc les 14 jours
   * s'appliquent. La bascule attend les deux réponses de Lenbox (codes `…XG` ouverts
   * sur le compte, et commission marchand). Voir `FRAIS_A_LA_CHARGE_DU_CLIENT`. */
  const horsCredit = echeanciersPour(total).filter(
    (e) => e.tauxClient === 0 && e.fois <= ECHEANCES_MAX_HORS_CREDIT,
  );

  if (horsCredit.length === 0) {
    return {
      echeanciers: [],
      motif:
        `Le paiement en plusieurs fois n'est possible que pour une session à plus de ` +
        `${DELAI_RETRACTATION_JOURS} jours : un financement ouvre un délai légal de ` +
        `rétractation de ${DELAI_RETRACTATION_JOURS} jours, qui doit être écoulé avant ` +
        `l'épreuve. Votre session est dans ${jours} jour${jours > 1 ? "s" : ""}. ` +
        `En réservant une date plus lointaine, vous y auriez droit.`,
    };
  }

  return { echeanciers: horsCredit, motif: null, renonciationRequise: true, jours };
}

/**
 * Au-delà de 3 échéances mensuelles, le remboursement dépasse trois mois et le
 * financement redevient un crédit à la consommation (art. L. 312-4 c. conso) : le
 * délai de rétractation de 14 jours s'applique de nouveau. Le 4× tient parce que ses
 * trois dernières échéances tombent dans les 90 jours du contrat ; le 10× ne tient pas.
 */
const ECHEANCES_MAX_HORS_CREDIT = 4;

/**
 * Le libellé EXACT de la renonciation, au sens de l'art. L. 221-25 du code de la
 * consommation. À afficher sur une case à cocher dédiée, JAMAIS pré-cochée, et à
 * reprendre dans la confirmation envoyée au candidat.
 */
export function libelleRenonciation(jours: number, dateExamen: string): string {
  return (
    `Mon examen a lieu dans ${jours} jour${jours > 1 ? "s" : ""} (le ${dateExamen}), ` +
    `donc avant la fin du délai de rétractation de 14 jours. Je demande expressément ` +
    `que ma prestation commence immédiatement et je reconnais que je perdrai mon droit ` +
    `de rétractation une fois celle-ci pleinement exécutée.`
  );
}

/**
 * Les échéanciers d'un total, sans contrôle de date. Usage interne : passer par
 * `fractionnePour()`, qui applique le délai de rétractation.
 */
export function echeanciersPour(total: number): Echeancier[] {
  if (!lenboxPret()) return [];
  if (!isFinite(total) || total < SEUIL_FRACTIONNE) return [];
  if (total < MONTANT_MIN || total > MONTANT_MAX) return [];

  return ECHEANCIERS.map((e) => {
    const totalClient = cents(total * (1 + e.tauxClient));
    const mensualite = cents(totalClient / e.fois);
    // La dernière échéance porte le reliquat : n × arrondi ne fait pas toujours le total.
    const derniere = cents(totalClient - mensualite * (e.fois - 1));
    return { code: e.code, fois: e.fois, libelle: e.libelle, tauxClient: e.tauxClient, totalClient, mensualite, derniere };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES APPELS
   ───────────────────────────────────────────────────────────────────────────── */

async function appel(chemin: string, init: RequestInit): Promise<any> {
  const r = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(String(j?.detail || j?.message || `HTTP ${r.status}`));
  }
  return j;
}

/**
 * Jeton JWT, présenté en `Authorization: Bearer` sur TOUS les appels.
 *
 * `POST /api/token/` attend un couple **e-mail / mot de passe** (schéma :
 * `TokenObtainPairRequest { email, password }`) et rend `{ access, refresh }`.
 * La documentation rédigée parlait de `client_id` / `client_secret` : c'était faux,
 * et une première version de ce fichier l'avait recopié.
 *
 * Mis en cache quelques minutes : un jeton par appel ferait trois requêtes là où une
 * suffit, et le point d'authentification est le plus susceptible d'être limité en
 * débit. On garde une marge confortable avant expiration plutôt que de lire la date
 * du jeton — si l'appel suivant échoue en 401, le jeton se redemandera au prochain.
 */
let _jeton: { valeur: string; jusqua: number } | null = null;
const JETON_DUREE_MS = 4 * 60_000;

async function jeton(): Promise<string> {
  if (_jeton && Date.now() < _jeton.jusqua) return _jeton.valeur;
  const email = process.env.LENBOX_EMAIL?.trim();
  const motDePasse = process.env.LENBOX_PASSWORD?.trim();
  if (!email || !motDePasse) throw new Error("Identifiants d'API Lenbox absents.");
  const j = await appel("/token/", {
    method: "POST",
    body: JSON.stringify({ email, password: motDePasse }),
  });
  const t = j?.access;
  if (!t) throw new Error("Lenbox n'a pas renvoyé de jeton.");
  _jeton = { valeur: String(t), jusqua: Date.now() + JETON_DUREE_MS };
  return _jeton.valeur;
}

/** L'identifiant d'agence, exigé en chemin par la relecture de statut. */
function agence(): string {
  const a = process.env.LENBOX_AGENCY_ID?.trim();
  if (!a) throw new Error("Lenbox n'est pas configuré.");
  return a;
}

export type SessionLenbox = { sessionId: string; url: string };

/**
 * Crée une session de financement et renvoie la page de paiement.
 *
 * `customer_ref_id` porte l'identifiant de NOTRE commande : c'est le seul fil qui
 * relie une notification Lenbox à un dossier chez nous. Ne jamais l'enlever, ne
 * jamais y mettre autre chose — sans lui, un dossier financé n'a plus de candidat.
 *
 * Si `client.email` est fourni, Lenbox envoie lui-même le lien au candidat : utile
 * quand il abandonne la page sans finir son dossier.
 */
export async function creerSessionLenbox(args: {
  montant: number;
  titre: string;
  reference: string;
  echeanciers?: string[];
  client?: {
    civilite?: string | null; prenom?: string | null; nom?: string | null;
    email?: string | null; telephone?: string | null;
    adresse?: string | null; codePostal?: string | null; ville?: string | null;
  };
  urlNotification: string;
  urlSucces: string;
  urlEchec: string;
}): Promise<SessionLenbox> {
  /* 🔴 09/10/2026 — PLUS DE JETON ICI, et c'est ce qui débloque tout le fractionné.
   *
   * Mesuré ce soir contre l'API de production : `POST /api/demandes/session/` crée
   * une session (HTTP 201 avec `session_url`) en présentant le SEUL `agency_id`,
   * sans aucun en-tête d'autorisation. L'identifiant d'agence EST l'authentifiant.
   *
   * Or ce fichier appelait `jeton()` avant chaque création, et `POST /api/token/`
   * répondait HTTP 401 : l'erreur tombait AVANT la création, donc aucune session
   * Lenbox n'a jamais pu être ouverte depuis la mise en service. Le journal le
   * confirme : 0 succès, 4 `lenbox_identifiant_invalide`, 4 `paiement_lenbox_echec`
   * en 401. On réparait l'authentification d'un appel dont on n'avait pas besoin.
   *
   * ⚠️ Les deux fonctions de RELECTURE plus bas gardent `jeton()` : elles lisent des
   * données de l'agence, et rien ne dit qu'elles s'en passent. Si elles échouent,
   * elles échouent APRÈS l'encaissement — c'est gênant, jamais bloquant pour la
   * vente. Ne pas leur retirer le jeton sans l'avoir mesuré comme ici. */

  /* Champs conformes à `SessionDataRequest` du schéma OpenAPI. Les obligatoires sont
     `agency_id`, `payment_options`, `requested_amount` et `title` : rien d'autre ne
     fait échouer la création, mais `customer_ref_id` est vital pour NOUS (voir plus bas)
     et l'adresse évite de la redemander au candidat dans le parcours Lenbox. */
  const j = await appel("/demandes/session/", {
    method: "POST",
    body: JSON.stringify({
      agency_id: agence(),
      // ⚠️ CENTIMES, et un ENTIER. Voir l'avertissement en tête de fichier.
      requested_amount: Math.round(args.montant * 100),
      currency: "EUR",
      title: args.titre.slice(0, 120),
      /* `customer_ref_id` porte l'identifiant de NOTRE commande : c'est le seul fil
         qui relie une notification Lenbox à un dossier chez nous, et il nous revient
         par la RELECTURE, donc d'une source sûre. Ne jamais l'enlever, ne jamais y
         mettre autre chose — sans lui, un dossier financé n'a plus de candidat. */
      customer_ref_id: args.reference,
      payment_options: args.echeanciers ?? ECHEANCIERS.map((e) => e.code),
      notification_url: args.urlNotification,
      success_url: args.urlSucces,
      failure_url: args.urlEchec,
      is_test: lenboxEnTest(),
      // `SourceEnum` : nous appelons l'API publique, pas le widget ni le tableau de bord.
      source: "PUBLIC_API",
      client: {
        // `CiviliteEnum` = MR / MME / MLE. Nos formulaires disent « Madame » : on
        // traduit, et on omet plutôt que d'envoyer une valeur hors énumération.
        civilite: civiliteLenbox(args.client?.civilite) ?? undefined,
        first_name: args.client?.prenom ?? undefined,
        last_name: args.client?.nom ?? undefined,
        // Si `client.email` est fourni, Lenbox envoie lui-même le lien au candidat :
        // utile quand il abandonne la page sans finir son dossier.
        email: args.client?.email ?? undefined,
        phone_indicatif: "+33",
        phone_mobile: args.client?.telephone ?? undefined,
        line1: args.client?.adresse ?? undefined,
        zip_code: args.client?.codePostal ?? undefined,
        city: args.client?.ville ?? undefined,
        country_code: "FR",
      },
    }),
  });

  const url = j?.session_url;
  const id = j?.session_id;
  if (!id || typeof url !== "string") {
    throw new Error("Lenbox n'a pas renvoyé de page de financement.");
  }
  return { sessionId: String(id), url };
}

export type DossierLenbox = {
  id: string;
  statut: string;
  finance: boolean;
  test: boolean;
  reference: string | null;
  /** L'échéancier réellement accepté (`FLOA_4XP`…), utile au journal. */
  echeancierAccepte: string | null;
};

/**
 * Relit l'état d'un dossier CHEZ LENBOX. C'est la seule source de vérité du statut.
 *
 * 🔴 POURQUOI CETTE FONCTION EXISTE, ET POURQUOI ON NE LA SUPPRIME PAS
 *
 * Le schéma OpenAPI officiel ne décrit AUCUNE signature de webhook : aucune occurrence
 * de `signature`, `hmac`, `secret` ni d'en-tête dédié dans les 100 ko du schéma, relevé
 * le 09/10/2026. Ce n'était donc pas une lacune de la documentation rédigée : il n'y a
 * réellement rien. En l'état, quiconque connaît l'URL de notification peut POSTer
 * `status: FINANCED` et faire valider une inscription jamais payée.
 *
 * Le corps du webhook n'est donc QU'UN SIGNAL : « va regarder le dossier X ». Rien
 * d'autre. La validation se fait ici, sur la réponse de Lenbox, avec notre propre jeton.
 * Supprimer cette relecture pour « simplifier » rendrait l'encaissement falsifiable par
 * un POST anonyme : c'est délibéré, pas un détour.
 *
 * ⚠️ `DemandeStatus` NE PORTE AUCUN MONTANT (schéma : id, agency_id, is_test, status,
 * accepted_option, customer_ref_id). Le contrôle du montant passe donc par
 * `lireSessionLenbox()` — voir sa propre note.
 */
export async function lireDossierLenbox(demandeId: string): Promise<DossierLenbox> {
  const t = await jeton();
  const j = await appel(
    `/agencies/${encodeURIComponent(agence())}/demandes/${encodeURIComponent(demandeId)}/status/`,
    { method: "GET", headers: { authorization: `Bearer ${t}` } },
  );
  const statut = String(j?.status ?? "inconnu").toUpperCase();
  return {
    id: String(j?.id ?? demandeId),
    statut,
    // Seul FINANCED vaut encaissement. PAYMENT_ACTIVE, AWAITING_BANK_RESPONSE et
    // USER_ACTION_REQUIRED sont des états intermédiaires : les traiter comme payés
    // convoquerait un candidat dont la banque n'a pas répondu.
    finance: statut === "FINANCED",
    test: j?.is_test === true,
    reference: j?.customer_ref_id ? String(j.customer_ref_id) : null,
    echeancierAccepte: j?.accepted_option ? String(j.accepted_option) : null,
  };
}

export type SessionLenboxLue = {
  id: string;
  statut: string;
  test: boolean;
  reference: string | null;
  /** En EUROS. Lenbox le stocke en centimes, la conversion est faite ici. */
  montant: number | null;
};

/**
 * Relit la SESSION de financement — et c'est elle qui porte le MONTANT.
 *
 * `GET /api/demandes/session/{session_id}/` rend un `SessionData`, qui contient
 * `requested_amount` (entier, centimes), `status`, `customer_ref_id` et `is_test`.
 *
 * 🔴 Pourquoi on lit la session ET le dossier, au lieu du seul dossier :
 *
 * La réponse de statut d'un dossier ne contient aucun montant. Sans ce second appel,
 * le récepteur devrait encaisser sans vérifier COMBIEN a été financé — c'est-à-dire
 * accepter qu'un dossier de 50 € valide une commande de 660 €.
 *
 * Et surtout : l'identifiant de session est celui que NOUS avons enregistré à la
 * création de la commande (`commandes_en_ligne.lenbox_session_id`), pas celui que le
 * webhook nous souffle. On interroge donc Lenbox sur un identifiant de notre choix,
 * ce qui est la lecture la plus sûre dont on dispose : ni le chemin, ni la question,
 * ni la réponse ne viennent d'un tiers.
 */
export async function lireSessionLenbox(sessionId: string): Promise<SessionLenboxLue> {
  const t = await jeton();
  const j = await appel(`/demandes/session/${encodeURIComponent(sessionId)}/`, {
    method: "GET", headers: { authorization: `Bearer ${t}` },
  });
  const centimes = Number(j?.requested_amount);
  return {
    id: String(j?.id ?? sessionId),
    statut: String(j?.status ?? "inconnu").toUpperCase(),
    test: j?.is_test === true,
    reference: j?.customer_ref_id ? String(j.customer_ref_id) : null,
    montant: isFinite(centimes) ? cents(centimes / 100) : null,
  };
}

/**
 * Lit une notification Lenbox, quel que soit son format.
 *
 * Deux formats sont documentés, et ils se contredisent : enveloppé
 * (`{request_id, event_type, event_data}`) et plat (`{id, is_test,
 * customer_ref_id, status, created, modified}`). On accepte les deux plutôt que
 * de parier sur celui qui arrivera — et de découvrir le mauvais pari sur un
 * dossier financé qu'on n'a pas vu passer.
 *
 * Les valeurs extraites ne sont PAS des faits : seuls les identifiants servent,
 * et uniquement pour aller relire le dossier à la source.
 */
export function lireNotificationLenbox(corps: any): {
  dossierId: string | null;
  reference: string | null;
  statutAnnonce: string | null;
  testAnnonce: boolean;
} {
  const d = corps?.event_data && typeof corps.event_data === "object" ? corps.event_data : corps;
  const dossierId = d?.id ?? d?.demande_id ?? corps?.request_id ?? null;
  return {
    dossierId: dossierId ? String(dossierId) : null,
    reference: d?.customer_ref_id ? String(d.customer_ref_id) : null,
    statutAnnonce: d?.status ? String(d.status).toUpperCase() : (corps?.event_type ? String(corps.event_type).toUpperCase() : null),
    testAnnonce: d?.is_test === true,
  };
}

/**
 * Les HUIT statuts de `StatusEnum`, recopiés du schéma OpenAPI.
 *
 * ⚠️ `REIMBOURSED` et `ABANDONNED` sont bien orthographiés ainsi par Lenbox. On
 * recopie leur orthographe sans la corriger : une comparaison « corrigée » échouerait
 * silencieusement, et un remboursement passerait inaperçu.
 *
 * Un seul compte pour encaisser : `FINANCED`. `PAYMENT_ACTIVE`,
 * `AWAITING_BANK_RESPONSE` et `USER_ACTION_REQUIRED` sont des états intermédiaires —
 * les traiter comme payés convoquerait un candidat dont la banque n'a pas répondu.
 */
export const STATUTS_LENBOX = [
  "DRAFT", "FINANCED", "PAYMENT_ACTIVE", "AWAITING_BANK_RESPONSE",
  "ALL_REJECTED", "ABANDONNED", "REIMBOURSED", "USER_ACTION_REQUIRED",
] as const;

/** Les civilités acceptées par Lenbox (`CiviliteEnum`). Nos formulaires disent « Madame ». */
export function civiliteLenbox(v: string | null | undefined): string | null {
  const x = String(v ?? "").trim().toLowerCase();
  if (x.startsWith("madame") || x === "mme") return "MME";
  if (x.startsWith("monsieur") || x === "mr" || x === "m.") return "MR";
  if (x.startsWith("mademoiselle") || x === "mle") return "MLE";
  return null;
}
