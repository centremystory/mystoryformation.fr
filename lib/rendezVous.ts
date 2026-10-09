/**
 * MYSTORY — le rendez-vous au bureau, côté serveur. Agences, créneaux, arbitrage.
 *
 * 09/10/2026. Consigne du dirigeant : « le rendez vous doit être automatique ils
 * choisisent la date, l'heure, l'agence et on reçoit un mail recap juste. »
 *
 * Ce fichier est la grille et l'arbitre de `/api/rendez-vous`. Il tient trois
 * choses, et c'est pour cela qu'il existe plutôt que d'habiter dans la route :
 *
 *   1. Les CRÉNEAUX offerts — une règle d'ouverture écrite une seule fois ;
 *   2. L'ARBITRAGE de la course entre deux candidats sur le même créneau ;
 *   3. Le TRIAGE « titre de séjour », et surtout ce que le candidat doit APPORTER.
 *
 * ── LA RÈGLE QUI TIENT TOUT ─────────────────────────────────────────────────────
 * Elle est la même que pour les matinées de préparation (`lib/commande.ts`) et pour
 * les places d'examen (`lib/occupationSessions.ts`) : **ce qui se compte se compte
 * dans la base, jamais dans le navigateur, et jamais par un `count` suivi d'un
 * `insert`.** Deux candidats peuvent cliquer le même 14 h 30 à la même seconde ;
 * c'est l'index unique partiel `rendez_vous_un_creneau_une_fois` qui tranche, et
 * l'application se contente de lire son verdict.
 *
 * Le site AFFICHE les créneaux, le CRM les ATTRIBUE. Les deux doivent tomber
 * d'accord sur la liste — d'où `src/lib/rendez-vous.ts` côté site, qui applique les
 * mêmes bornes. Si les deux divergent un jour, c'est CE fichier qui a raison : lui
 * seul voit la base.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ─────────────────────────────────────────────────────────────────────────────
   LES AGENCES
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Les trois agences où l'on reçoit en rendez-vous.
 *
 * Le code est celui de `lib/sites.ts` (« Rosny », et non « Rosny-sous-Bois ») :
 * c'est la valeur que porte déjà la colonne `agence` dans tout le CRM, et une
 * agence qui s'écrirait de deux façons est une agence qu'on ne retrouve plus en
 * filtrant.
 *
 * ⚠️ Pantin n'y est PAS, et ce n'est pas un oubli : c'est un site PARTENAIRE
 * (IFIE Formation, organisme indépendant avec sa propre déclaration d'activité).
 * Jamais un lieu de rendez-vous MYSTORY. La base le refuse aussi, par contrainte.
 */
export const AGENCES_RDV = [
  {
    code: "Rosny",
    nom: "Rosny-sous-Bois",
    adresse: "46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois",
    /** Rosny est le SEUL centre d'examen agréé (TEF IRN et civique) depuis le 28/09/2026. */
    centreExamen: true,
  },
  {
    code: "Gagny",
    nom: "Gagny",
    adresse: "3 bis avenue de Gagny, 93220 Gagny",
    centreExamen: false,
  },
  {
    code: "Sarcelles",
    nom: "Sarcelles",
    adresse: "18 avenue du 8 Mai 1945, 95200 Sarcelles",
    centreExamen: false,
  },
] as const;

export type CodeAgence = (typeof AGENCES_RDV)[number]["code"];

export function agence(code: string) {
  return AGENCES_RDV.find((a) => a.code === code) ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES CRÉNEAUX
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * L'amplitude d'accueil : 9 h 30 → 17 h 30, d'une seule traite, dans les trois agences.
 *
 * 🔴 CE CHIFFRE EST ARBITRÉ, PAS DEVINÉ. Le dépôt du site se contredisait :
 *   — `src/components/sections/rendez-vous/donnees.ts` : « 9 h 30 – 17 h 30 »,
 *     amplitude donnée par le dirigeant le 09/10/2026 pour les trois centres ;
 *   — `src/app/contact/page.tsx` et `ContactClient.tsx` : lundi-vendredi 9 h – 18 h
 *     et samedi 9 h – 13 h, dans le balisage Schema.org comme à l'écran.
 *
 * On retient 9 h 30 – 17 h 30, du lundi au samedi : c'est la décision du dirigeant
 * du 09/10, et c'est elle qu'affiche déjà la page /rendez-vous. L'incohérence de
 * /contact n'est PAS recopiée ici — elle est signalée pour être tranchée, parce que
 * publier deux amplitudes différentes sur le même site finit par un candidat devant
 * une porte fermée.
 *
 * ⚠️ Pas de pause déjeuner retirée : personne ne l'a donnée. Inventer une coupure de
 * 12 h 30 à 14 h supprimerait trois créneaux par jour et par agence sans qu'aucune
 * décision ne le demande. C'est une question posée au dirigeant, pas un défaut à
 * corriger en douce.
 */
export const OUVERTURE = "09:30";
export const FERMETURE = "17:30";

/** Jours d'accueil : lundi (1) → samedi (6). Le dimanche est fermé. */
const JOURS_OUVRABLES = new Set([1, 2, 3, 4, 5, 6]);

/**
 * Durée d'un rendez-vous.
 *
 * 30 minutes : rien dans le dépôt n'indiquait le contraire, et c'est le temps d'un
 * montage de dossier CPF quand le candidat arrive avec ses pièces — ce que le
 * triage « titre de séjour » sert précisément à obtenir.
 */
export const DUREE_RDV_MINUTES = 30;

/**
 * Jusqu'où on ouvre le calendrier : 28 jours.
 *
 * Quatre semaines, c'est assez long pour que personne ne trouve la liste vide, et
 * assez court pour qu'on ne promette pas une conseillère un mardi de décembre dont
 * on ne sait rien. La fenêtre se changera le jour où les plannings d'équipe
 * piloteront vraiment les disponibilités (voir l'en-tête de `creneauxOuverts`).
 */
export const FENETRE_RDV_JOURS = 28;

/**
 * Délai minimum entre maintenant et le début du rendez-vous : 2 heures.
 *
 * Un rendez-vous réservé à 14 h 05 pour 14 h 30 ne laisse à personne le temps de
 * lire le récapitulatif. Le candidat se présente, l'agence ne l'attend pas : c'est
 * pire que pas de réservation du tout, parce qu'il croyait être attendu.
 */
export const DELAI_MINIMUM_HEURES = 2;

/* ─────────────────────────────────────────────────────────────────────────────
   🔴 LES GARDE-FOUS — pourquoi ils sont là, et ce qui a été écarté
   ─────────────────────────────────────────────────────────────────────────────

   Une revue de sécurité a relevé le 09/10/2026, le jour même de la mise en
   service, deux dégâts possibles. Ils n'ont rien de théorique :

   1. ÉPUISEMENT DES CRÉNEAUX. Sans limite réelle, on réserve tous les créneaux
      de tous les centres pour des semaines. Et un rendez-vous, contrairement à
      une matinée de préparation, n'avait aucune péremption : pris, il restait
      pris. C'est le dégât le plus coûteux — un agenda saturé de faux
      rendez-vous, c'est du chiffre d'affaires perdu, et personne ne s'en aperçoit
      avant le jour J.

   2. EXPÉDITEUR OUVERT. La confirmation part à l'adresse saisie, sans preuve
      qu'elle appartienne au demandeur. On peut donc nous faire envoyer des
      messages à des tiers depuis notre domaine. Le vrai coût n'est pas la
      nuisance : c'est la réputation d'expéditeur. Si contact@mystoryformation.fr
      se fait classer en indésirable, les CONVOCATIONS D'EXAMEN cessent
      d'arriver — panne vécue les 09 et 10/09/2026, et elle avait coûté cher.

   CE QUI A ÉTÉ RETENU, par ordre d'efficacité :

   — la péremption des rendez-vous NON CONFIRMÉS (`DELAI_CONFIRMATION_HEURES`),
     motif repris à l'identique de `matinees_preparation`. Un robot qui ne lit
     pas la boîte du candidat ne confirme rien, et ses créneaux retombent ;
   — la CONFIRMATION PAR LIEN SIGNÉ (HMAC, `signerRdv` plus bas) : le
     rendez-vous ne devient ferme que si l'adresse a été prouvée. C'est ce qui
     règle les deux dégâts du même geste ;
   — les plafonds par agence et par jour, et un plafond global quotidien, qui
     bornent directement le nombre de courriels sortants (`RDV_MAX_*`) ;
   — les compteurs tenus EN BASE (`rate_hit`, cf. lib/rateLimit.ts) et l'IP lue
     à une source de confiance (`ipDeConfiance`). Un compteur en mémoire est de
     toute façon inopérant sur Vercel — chaque requête peut tomber sur une autre
     instance — et un compteur qu'on vide quand il déborde est une faille à lui
     seul : il suffit de le faire déborder pour l'effacer.

   CE QUI A ÉTÉ ÉCARTÉ, délibérément :

   — LE CAPTCHA. C'est la suggestion automatique, et elle contredit la stratégie
     du dirigeant : le site doit réserver sans conseiller et sans faire fuir
     personne. Un CAPTCHA à l'entrée d'un rendez-vous commercial coûterait plus
     de rendez-vous qu'il n'en protégerait. Les mesures ci-dessus suffisent à
     borner le dégât ; le captcha, lui, borne le chiffre d'affaires.
   ───────────────────────────────────────────────────────────────────────────── */

/** Plafond de rendez-vous à venir pour une même adresse e-mail (anti-abus). */
export const RDV_MAX_PAR_EMAIL = 3;

/**
 * Combien de temps un rendez-vous NON CONFIRMÉ retient son créneau : 12 heures.
 *
 * Le créneau est retenu dès la réservation — sinon deux candidats simultanés
 * prendraient la même heure, et c'est précisément ce que l'index d'unicité sert à
 * empêcher. Mais la retenue est provisoire tant que personne n'a prouvé que
 * l'adresse existe.
 *
 * Trois durées ont été pesées :
 *   — 2 heures : trop court. L'essentiel du trafic vient de TikTok et de
 *     Facebook, souvent le soir ; quelqu'un qui réserve à 23 h et consulte sa
 *     boîte au réveil perdrait son rendez-vous sans comprendre pourquoi ;
 *   — 24 heures : trop long. Une journée de créneaux immobilisée par vague ;
 *   — 12 heures : retenu. Une nuit de sommeil tient dedans, et le plafond par
 *     agence et par jour borne de toute façon le nombre de créneaux retenables
 *     simultanément.
 *
 * ⚠️ La péremption est MATÉRIALISÉE (`statut = 'annule'`, `annule_par =
 * 'peremption_non_confirme'`) et non calculée à la lecture. Même raison que pour
 * les matinées : l'index d'unicité ne porte que sur les rendez-vous non annulés,
 * donc une réservation périmée restée « confirme » continuerait d'interdire son
 * créneau — le calendrier dirait « libre » et l'insertion échouerait quand même.
 */
export const DELAI_CONFIRMATION_HEURES = 12;

/**
 * Plafond de rendez-vous pris EN LIGNE dans une agence, pour une même journée : 8.
 *
 * Une journée compte 16 créneaux de 30 minutes. En plafonner la moitié laisse de
 * la place au téléphone et au comptoir, et surtout : même en cas d'abus réussi,
 * une agence n'est jamais bloquée pour la journée. C'est une SOUPAPE, pas une
 * règle commerciale — à relever dès qu'on connaîtra le volume réel, ce qui est
 * une décision du dirigeant, pas un réglage technique.
 */
export const RDV_MAX_PAR_AGENCE_ET_JOUR = 8;

/**
 * Plafond global de réservations en ligne sur 24 heures, tous centres confondus : 40.
 *
 * C'est ce chiffre, et lui seul, qui borne le nombre de courriels que nous pouvons
 * être amenés à envoyer vers des adresses non prouvées en une journée. Il protège
 * la réputation d'expéditeur du domaine — donc l'arrivée des convocations. Il est
 * très au-dessus du volume attendu : il ne se verra que le jour où quelque chose
 * ne va pas.
 */
export const RDV_MAX_PAR_JOUR_TOUS_CENTRES = 40;

/** Date du jour à Paris, en AAAA-MM-JJ. */
function isoParis(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/** « 14:05 » — l'heure de Paris, comparable en TEXTE à nos créneaux. */
function heureParis(d: Date): string {
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Paris",
  });
}

/** « 09:30 » → 570. Sert à additionner des minutes sans toucher aux fuseaux. */
function enMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 570 → « 09:30 ». Deux chiffres toujours : l'index d'unicité en dépend. */
function enHeure(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Les heures proposables dans une journée : 09:30, 10:00, … 17:00.
 *
 * Le DERNIER créneau commence une durée avant la fermeture — un rendez-vous de
 * 30 minutes à 17 h 30 finirait à 18 h, porte close.
 */
export function heuresDuJour(): string[] {
  const liste: string[] = [];
  const fin = enMinutes(FERMETURE) - DUREE_RDV_MINUTES;
  for (let m = enMinutes(OUVERTURE); m <= fin; m += DUREE_RDV_MINUTES) {
    liste.push(enHeure(m));
  }
  return liste;
}

/** « lundi 12 octobre 2026 » — le libellé qu'on écrit dans les courriels. */
export function jourLisible(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/** « 9 h 30 » — l'heure telle qu'on l'écrit en français, pas « 09:30 ». */
export function heureLisible(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

export type JourRdv = {
  /** AAAA-MM-JJ */
  iso: string;
  /** « lundi 12 octobre 2026 » */
  label: string;
  heures: string[];
};

/**
 * Les créneaux OUVERTS (indépendamment de ce qui est déjà pris).
 *
 * On écarte deux choses, et une seule des deux est évidente :
 *   — les dimanches, et les jours hors de la fenêtre ;
 *   — les créneaux déjà passés ou trop proches (`DELAI_MINIMUM_HEURES`). Proposer
 *     un créneau qu'on ne peut plus honorer, c'est se préparer un appel mécontent.
 *
 * ⚠️ CE QUE CETTE FONCTION NE SAIT PAS, et il faut le savoir : elle ignore les
 * congés, les jours fériés et les plannings d'équipe. Un 25 décembre sera proposé.
 * Le CRM a bien des tables de congés et de planning, mais aucune ne dit « cette
 * agence reçoit du public à cette heure-là » — le déduire d'un planning de salariés
 * serait une invention, et une invention qui ferme des créneaux se paie en
 * rendez-vous perdus. Le récapitulatif part au secrétariat, qui rappelle pour
 * déplacer : c'est la position la moins coûteuse tant que la règle n'est pas écrite.
 */
export function creneauxOuverts(maintenant = new Date()): JourRdv[] {
  const aujourdhui = isoParis(maintenant);
  const heures = heuresDuJour();

  // Le seuil « maintenant + 2 h », exprimé en minutes dans la journée de Paris.
  const seuilAujourdhui = enMinutes(heureParis(maintenant)) + DELAI_MINIMUM_HEURES * 60;

  const jours: JourRdv[] = [];
  const curseur = new Date(`${aujourdhui}T12:00:00`);
  for (let i = 0; i <= FENETRE_RDV_JOURS; i++) {
    const iso = isoParis(curseur);
    curseur.setDate(curseur.getDate() + 1);
    if (!JOURS_OUVRABLES.has(new Date(`${iso}T12:00:00`).getDay())) continue;

    const dispo = iso === aujourdhui
      ? heures.filter((h) => enMinutes(h) >= seuilAujourdhui)
      : heures;
    if (dispo.length) jours.push({ iso, label: jourLisible(iso), heures: dispo });
  }
  return jours;
}

/** Un créneau est-il dans la grille d'ouverture ? Revérifié côté serveur, toujours. */
export function creneauOuvert(
  dateIso: string, heure: string, maintenant = new Date(),
): boolean {
  return creneauxOuverts(maintenant).some(
    (j) => j.iso === dateIso && j.heures.includes(heure),
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CE QUI EST DÉJÀ PRIS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Les créneaux déjà pris dans une agence, par date.
 *
 * Seuls les rendez-vous VIVANTS comptent : un rendez-vous annulé a rendu sa place,
 * exactement comme l'index d'unicité le prévoit. Lire autrement afficherait des
 * créneaux occupés que la base accepterait pourtant — et l'inverse est encore pire.
 */
export async function creneauxPris(
  codeAgence: string, duIso: string, auIso: string,
): Promise<Map<string, Set<string>>> {
  const pris = new Map<string, Set<string>>();
  // On nettoie AVANT de compter : sinon un agenda paraît plein de réservations
  // mortes, jamais confirmées. « Tiré, pas poussé » — voir la fonction.
  await libererRendezVousNonConfirmes();
  const { data } = await supabaseAdmin
    .from("rendez_vous")
    .select("date_rdv, heure")
    .eq("agence", codeAgence)
    .neq("statut", "annule")
    .gte("date_rdv", duIso)
    .lte("date_rdv", auIso);

  for (const l of (data ?? []) as Array<{ date_rdv: string; heure: string }>) {
    const jour = String(l.date_rdv);
    if (!pris.has(jour)) pris.set(jour, new Set());
    pris.get(jour)!.add(String(l.heure));
  }
  return pris;
}

export type JourDisponible = {
  iso: string;
  label: string;
  /** Toutes les heures ouvertes du jour, avec leur état. Une heure prise reste
   *  dans la liste, grisée : une liste qui rétrécit sans explication fait croire
   *  à une panne du calendrier. */
  creneaux: Array<{ heure: string; libre: boolean }>;
};

/** Le calendrier complet d'une agence, places comprises. */
export async function disponibilites(
  codeAgence: string, maintenant = new Date(),
): Promise<JourDisponible[]> {
  const ouverts = creneauxOuverts(maintenant);
  if (!ouverts.length) return [];
  const pris = await creneauxPris(
    codeAgence, ouverts[0].iso, ouverts[ouverts.length - 1].iso,
  );
  return ouverts.map((j) => {
    const occupees = pris.get(j.iso) ?? new Set<string>();
    return {
      iso: j.iso,
      label: j.label,
      creneaux: j.heures.map((h) => ({ heure: h, libre: !occupees.has(h) })),
    };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   LE TRIAGE « TITRE DE SÉJOUR »
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Les trois cas, dictés par le dirigeant le 09/10/2026, et CE QU'IL FAUT APPORTER.
 *
 * Un dossier CPF ne meurt presque jamais sur le choix de la formation : il meurt sur
 * la VÉRIFICATION D'IDENTITÉ de moncompteformation.gouv.fr, et la marche à suivre
 * n'est pas la même selon le titre. Le candidat ne le découvre qu'une fois bloqué —
 * sauf si on le lui dit ici, avant la visite.
 *
 * `aApporter` est l'ajout de cette route : le triage ne sert à rien si le candidat
 * arrive les mains vides. C'est cette ligne-là qui fait qu'une visite suffit au lieu
 * de deux.
 *
 * ⚠️ Ces trois messages sont la consigne du dirigeant, presque mot pour mot. On ne
 * les ENRICHIT PAS d'une procédure administrative de plus : toute précision
 * réglementaire ajoutée ici doit d'abord être vérifiée sur service-public.gouv.fr ou
 * moncompteformation.gouv.fr, et sourcée. Les mêmes textes vivent côté site dans
 * `src/components/sections/rendez-vous/donnees.ts` — ils doivent rester identiques.
 */
export const SITUATIONS_TITRE = [
  {
    id: "moins-5-ans",
    option: "Titre de séjour de moins de 5 ans, en cours de validité",
    marcheASuivre:
      "Faire la procédure de vérification d'identité sur Mon Compte Formation " +
      "(moncompteformation.gouv.fr). Nous la faisons avec vous au rendez-vous si vous préférez.",
    aApporter:
      "votre titre de séjour, votre téléphone, et vos identifiants Mon Compte Formation si vous les avez",
  },
  {
    id: "resident-10-ans",
    option: "Carte de résident de 10 ans",
    marcheASuivre:
      "Créer d'abord l'identité numérique pour accéder à Mon Compte Formation. " +
      "Venez avec votre carte et votre téléphone, nous la créons ensemble.",
    aApporter:
      "votre carte de résident, votre téléphone (avec sa carte SIM à votre nom) et une pièce d'identité",
  },
  {
    id: "expire",
    option: "Titre de séjour expiré ou en cours de renouvellement",
    marcheASuivre:
      "Passer au bureau : il existe plusieurs solutions selon votre situation, et " +
      "elles se décident de vive voix. Nous vous les expliquons au rendez-vous.",
    aApporter:
      "votre titre expiré et, si vous en avez un, votre récépissé ou votre attestation de dépôt de demande",
  },
] as const;

export type IdSituation = (typeof SITUATIONS_TITRE)[number]["id"];

export function situationTitre(id: string) {
  return SITUATIONS_TITRE.find((s) => s.id === id) ?? null;
}

/** La démarche qui amène le candidat. Les identifiants sont ceux du site. */
export const MOTIFS_RDV = [
  { id: "naturalisation", label: "Naturalisation française" },
  { id: "resident", label: "Carte de résident de 10 ans" },
  { id: "pluriannuelle", label: "Carte de séjour pluriannuelle" },
  { id: "inconnu", label: "Je ne sais pas encore" },
] as const;

/** Ce qu'il cherche. */
export const OBJECTIFS_RDV = [
  { id: "cpf", label: "Une formation financée par mon CPF" },
  { id: "courte", label: "Une préparation courte (quelques demi-journées)" },
  { id: "examen", label: "Seulement passer l'examen" },
] as const;

export function libelleMotif(id: string): string | null {
  return MOTIFS_RDV.find((m) => m.id === id)?.label ?? null;
}

export function libelleObjectif(id: string): string | null {
  return OBJECTIFS_RDV.find((o) => o.id === id)?.label ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   RÉSERVER
   ───────────────────────────────────────────────────────────────────────────── */

export type DemandeRdv = {
  agence: string;
  date: string;
  heure: string;
  civilite?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  motif?: string;
  objectif?: string;
  situation: string;
  message?: string;
};

/**
 * Prend le créneau. C'est la base qui tranche, pas nous.
 *
 * On ne vérifie PAS la disponibilité avant d'insérer, et c'est délibéré : un
 * `select` suivi d'un `insert` laisse passer deux candidats qui cliquent à la même
 * seconde — les deux lisent « libre », les deux écrivent. On tente donc
 * directement, et on lit le verdict de l'index unique partiel :
 *
 *   — pas d'erreur  → le créneau est à nous ;
 *   — code 23505    → quelqu'un a été plus rapide. Ce n'est PAS une anomalie,
 *                     c'est la course qu'on attendait : on le dit au candidat et
 *                     on lui rend la liste rafraîchie.
 *
 * Même motif que `reserverMatinees()` dans `lib/commande.ts`, à une différence
 * près : une matinée a 15 chaises et l'application cherche la plus petite libre ;
 * un créneau de rendez-vous n'en a qu'une, donc il n'y a rien à chercher.
 */
/**
 * Type de retour VOLONTAIREMENT PLAT, et non une union discriminée.
 *
 * Le dépôt compile avec `strict: false` (donc `strictNullChecks: false`), et dans ce
 * mode TypeScript ne sait PAS réduire une union sur `ok: true | false` : `if (!r.ok)`
 * ne donne pas accès à `r.raison`. C'est déjà la forme retenue par
 * `reserverMatinees()` dans lib/commande.ts — on s'aligne au lieu d'inventer un
 * motif qui ne se vérifie pas à la compilation.
 */
export type ResultatReservation = {
  ok: boolean;
  /** Renseigné quand ok. */
  id?: string;
  /** Renseigné quand !ok. « pris » = la course a été perdue, pas une anomalie. */
  raison?: "pris" | "erreur";
  detail?: string;
};

export async function reserverCreneau(d: DemandeRdv): Promise<ResultatReservation> {
  // Idem avant d'écrire : le créneau qu'on s'apprête à prendre est peut-être
  // retenu par une réservation jamais confirmée, faite il y a treize heures.
  await libererRendezVousNonConfirmes();
  const { data, error } = await supabaseAdmin
    .from("rendez_vous")
    .insert({
      agence: d.agence,
      date_rdv: d.date,
      heure: d.heure,
      duree_minutes: DUREE_RDV_MINUTES,
      civilite: d.civilite || null,
      nom: d.nom.toUpperCase(),
      prenom: d.prenom,
      email: d.email,
      telephone: d.telephone,
      motif: d.motif || null,
      objectif: d.objectif || null,
      situation_titre: d.situation,
      message: d.message || null,
      origine: "site",
    })
    .select("id")
    .single();

  if (!error && data) return { ok: true, id: String((data as { id: string }).id) };
  if ((error as { code?: string } | null)?.code === "23505") {
    return { ok: false, raison: "pris" };
  }
  return { ok: false, raison: "erreur", detail: error?.message };
}

/** Combien de rendez-vous à venir cette adresse a-t-elle déjà ? (plafond anti-abus) */
export async function rdvAVenirPourEmail(email: string, maintenant = new Date()): Promise<number> {
  const { count } = await supabaseAdmin
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .neq("statut", "annule")
    .gte("date_rdv", isoParis(maintenant));
  return Number(count ?? 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA PÉREMPTION — « tiré, pas poussé »
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Libère les créneaux retenus par des rendez-vous jamais confirmés.
 *
 * **Tiré, pas poussé** — même principe que `libererReservationsPerimees()` pour les
 * matinées et que `occupationDe()` pour les sessions d'examen : personne ne balaie en
 * tâche de fond, c'est la lecture suivante du calendrier (ou la réservation suivante)
 * qui nettoie. Un cron tournerait toutes les cinq minutes pour rien l'essentiel du
 * temps, alors que la seule fois où le compte doit être juste, c'est quand quelqu'un
 * regarde.
 *
 * On ne SUPPRIME rien — règle MYSTORY : le rendez-vous passe `annule` avec
 * `annule_par = 'peremption_non_confirme'`. Deux bénéfices : l'index d'unicité étant
 * partiel (`where statut <> 'annule'`), le créneau redevient réellement prenable ; et
 * on voit dans le CRM combien de réservations ne sont jamais confirmées — c'est le
 * seul chiffre qui dira si le délai de 12 heures est le bon.
 *
 * Ne lève jamais : un échec de nettoyage ne doit pas faire tomber un calendrier.
 */
export async function libererRendezVousNonConfirmes(): Promise<void> {
  const limite = new Date(Date.now() - DELAI_CONFIRMATION_HEURES * 3_600_000).toISOString();
  try {
    await supabaseAdmin
      .from("rendez_vous")
      .update({
        statut: "annule",
        annule_le: new Date().toISOString(),
        annule_par: "peremption_non_confirme",
      })
      .eq("statut", "confirme")
      .is("confirme_le", null)
      .lt("cree_le", limite);
  } catch {
    /* le nettoyage ne doit jamais faire échouer la lecture qui l'a déclenché */
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   LE LIEN DE CONFIRMATION — ce qui prouve que l'adresse existe
   ───────────────────────────────────────────────────────────────────────────── */

const SECRET = process.env.AUTH_SECRET ?? "";
/** Domaine de signature explicite : une signature de rendez-vous ne peut pas être
 *  rejouée ailleurs (session, lien de correction d'évaluation…) même si la même clé
 *  sert partout. Motif repris de `lib/jetonCorrection.ts`. */
const DOMAINE = "mystory:rendez-vous:v1";

/**
 * Signature d'un rendez-vous. Chaîne vide si aucun secret n'est configuré : sans
 * secret on ne fabrique PAS de lien, plutôt que d'en fabriquer un forgeable.
 *
 * Pas de colonne en base pour le jeton, volontairement : une signature dérivée ne
 * coûte aucune migration, ne peut pas être lue en base par erreur, et se révoque en
 * faisant tourner `AUTH_SECRET`.
 */
export function signerRdv(id: string): string {
  if (!SECRET || !id) return "";
  return createHmac("sha256", SECRET).update(`${DOMAINE}:${id}`).digest("base64url").slice(0, 32);
}

/** Vérification à temps constant. Refuse toujours si le secret manque. */
export function jetonRdvValide(id: string, signature: unknown): boolean {
  const attendue = signerRdv(id);
  if (!attendue) return false;
  const fournie = String(signature ?? "");
  if (fournie.length !== attendue.length) return false;
  try {
    return timingSafeEqual(Buffer.from(fournie), Buffer.from(attendue));
  } catch {
    return false;
  }
}

/** Le lien complet à mettre dans le courriel du candidat. */
export function lienConfirmation(base: string, id: string): string {
  const sig = signerRdv(id);
  if (!sig) return "";
  return `${base.replace(/\/+$/, "")}/api/rendez-vous/confirmer?r=${encodeURIComponent(id)}&s=${sig}`;
}

/**
 * Le candidat a cliqué : le rendez-vous devient ferme.
 *
 * Idempotent — un lien cliqué deux fois (l'anti-virus du client de messagerie le
 * fait tout seul) ne doit pas produire d'erreur ni réécrire la date de confirmation.
 * Et un rendez-vous ANNULÉ ne se réveille pas par un clic tardif : si la péremption
 * a déjà rendu le créneau, il a peut-être été repris par quelqu'un d'autre, et le
 * ressusciter mettrait deux personnes sur la même chaise.
 */
export async function confirmerRdv(id: string): Promise<
  { ok: boolean; etat: "confirme" | "deja_confirme" | "perime" | "inconnu"; rdv?: Record<string, unknown> }
> {
  const { data } = await supabaseAdmin
    .from("rendez_vous")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, etat: "inconnu" };
  const r = data as Record<string, unknown>;

  if (r.statut === "annule") return { ok: false, etat: "perime", rdv: r };
  if (r.confirme_le) return { ok: true, etat: "deja_confirme", rdv: r };

  const { error } = await supabaseAdmin
    .from("rendez_vous")
    .update({ confirme_le: new Date().toISOString() })
    .eq("id", id)
    .is("confirme_le", null);
  if (error) return { ok: false, etat: "inconnu", rdv: r };
  return { ok: true, etat: "confirme", rdv: r };
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES PLAFONDS LUS EN BASE
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Combien de rendez-vous vivants dans cette agence, ce jour-là.
 *
 * Compté EN BASE et pas dans un compteur de débit : c'est la seule mesure qui
 * survive à un redémarrage et qui soit la même pour toutes les instances Vercel.
 */
export async function rdvDansAgenceLeJour(codeAgence: string, dateIso: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .eq("agence", codeAgence)
    .eq("date_rdv", dateIso)
    .neq("statut", "annule");
  return Number(count ?? 0);
}

/**
 * Combien de réservations en ligne sur les 24 dernières heures, tous centres.
 *
 * ⚠️ On compte ici les rendez-vous CRÉÉS, y compris ceux déjà périmés ou annulés :
 * c'est le nombre de COURRIELS qu'on a envoyés qu'on veut borner, et un message
 * parti ne se dé-envoie pas. Filtrer sur les rendez-vous vivants laisserait une
 * boucle d'abandons envoyer autant de messages qu'elle veut.
 */
export async function rdvCreesDernieres24h(): Promise<number> {
  const depuis = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabaseAdmin
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .gte("cree_le", depuis);
  return Number(count ?? 0);
}
