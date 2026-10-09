/**
 * MYSTORY — Les LIENS NOMINATIFS envoyés au candidat, et ce qu'ils ouvrent.
 *
 * 09/10/2026 (soir). Demande du dirigeant, mot pour mot : « sors moi tous les
 * formulaires, je veux un formulaire quand on fait le courrier de vérification
 * d'identité en ligne ou par courrier ou les 2, un lien pour dire qu'on a
 * finalisé le devis, un en attente de 150 euros à payer et tout ce qui te
 * semble bon. »
 *
 * Quatre pages publiques en sont sorties, et elles partagent TOUT ce qui est
 * ici : le jeton, la lecture du dossier, le refus, l'idempotence. Le reste —
 * la mise en forme — vit dans chaque route.
 *
 *   /identite?j=…      la voie de vérification : en ligne, par courrier, ou les deux
 *   /devis?j=…         « votre devis est finalisé », avec l'acceptation
 *   /participation?j=… « il reste 150 € à régler », avec le paiement Mollie
 *   /coordonnees?j=…   la relecture de l'état civil, pré-rempli
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA RÈGLE QUI A DICTÉ CES QUATRE PAGES — elle vient d'une MESURE, pas d'un goût
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Relevé en base du 09/10/2026 : `taches`, `remarques`, `messages_internes` et
 * `reclamations` contiennent 0 ligne. `messages_equipe` et `questions_internes`
 * en contiennent 1. Cinq surfaces de coordination existent dans ce CRM, toutes
 * vides. La seule qui se remplisse — `journal`, 841 lignes en 90 jours — est
 * écrite par des machines.
 *
 * La conclusion n'est pas « l'équipe est négligente », c'est : **un écran qui
 * demande de TAPER ne sera pas utilisé.** Ces pages s'adressent en plus à des
 * candidats, sur un téléphone, souvent non francophones — la marge est encore
 * plus mince.
 *
 * D'où la contrainte, à tenir pour toute page ajoutée ici :
 *   — aucun champ de saisie libre quand une case à cocher suffit ;
 *   — tout ce qui est en base arrive PRÉ-REMPLI, le candidat corrige au besoin ;
 *   — une page = une décision, prise en un geste.
 *
 * Second relevé : les quatre mêmes informations — heures · dates des cours ·
 * date d'examen · dossier complet ou non — sont recopiées CINQ fois à la main
 * par l'équipe. Chacune de ces pages supprime au moins une de ces copies, et
 * c'est le seul critère qui a fait retenir celles-là plutôt que d'autres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CE QUE CES PAGES N'ÉCRIVENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Une page ouverte par un lien reçu par e-mail est remplie par quelqu'un dont
 * on ne sait rien de plus que « il a le lien ». Elle ne peut donc PAS :
 *
 *   — valider une vérification d'identité (`stagiaires.verification_identite`
 *     reste à l'équipe : la page remplit la VOIE, pas le statut) ;
 *   — exonérer de la participation forfaitaire (elle enregistre une DEMANDE) ;
 *   — se déclarer payée (seul le webhook Mollie l'écrit, après relecture à la
 *     source — cf. app/api/participation/paiement).
 *
 * Toute évolution qui franchirait une de ces trois lignes transformerait un
 * lien en courriel en pouvoir d'écriture sur un dossier de financement public.
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TICKET_MODERATEUR } from "@/lib/inscriptions/regles";

/* ─────────────────────────────────────────────────────────────────────────────
   LES TYPES DE LIEN ET LEUR DURÉE DE VIE
   ───────────────────────────────────────────────────────────────────────────── */

export const TYPES_LIEN = ["identite", "devis", "participation", "coordonnees"] as const;
export type TypeLien = (typeof TYPES_LIEN)[number];

/**
 * Combien de jours vit chaque lien.
 *
 * Ce ne sont pas des durées arrondies au hasard : chacune est la réponse à
 * « combien de temps est-il raisonnable qu'un candidat mette à faire ça ? ».
 *
 *   — `devis` : 30 jours. C'est une offre commerciale ; elle doit survivre à
 *     des vacances et à une boîte mal relevée. Au-delà, le dossier a bougé et
 *     le devis n'est plus le bon — mieux vaut en renvoyer un neuf que laisser
 *     accepter un prix périmé.
 *   — `identite` et `coordonnees` : 60 jours. Ce sont des démarches
 *     administratives, qui attendent un rendez-vous en mairie ou une pièce à
 *     retrouver. Un lien trop court y crée un appel au secrétariat, rien d'autre.
 *   — `participation` : 45 jours. Un appel de fonds ne doit pas traîner — la
 *     convention est bloquée tant qu'il n'est pas soldé (cf. lib/gates.ts) —
 *     mais il tombe souvent avant une paie.
 *
 * ⚠️ Un lien périmé n'est pas un échec : la page invite à appeler, et l'équipe
 * en renvoie un. C'est le comportement voulu, pas un défaut à rallonger.
 */
export const DUREE_JOURS: Record<TypeLien, number> = {
  identite: 60,
  devis: 30,
  participation: 45,
  coordonnees: 60,
};

/** Le chemin public de chaque type. Un seul endroit, pour que les liens ne divergent pas. */
const CHEMIN: Record<TypeLien, string> = {
  identite: "/identite",
  devis: "/devis",
  participation: "/participation",
  coordonnees: "/coordonnees",
};

/* ─────────────────────────────────────────────────────────────────────────────
   LE JETON
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 UN JETON ALÉATOIRE RANGÉ EN BASE, ET NON UNE SIGNATURE DE L'IDENTIFIANT.
 *
 * Le mécanisme est repris TEL QUEL de `lib/rendezVous.ts` (`nouveauJeton`), dont
 * le raisonnement est écrit au long là-bas. Il n'est pas réinventé ici, et
 * surtout il n'est pas remplacé par un HMAC sur le modèle de
 * `lib/jetonCorrection.ts` : une signature dérivée est imprévisible et liée au
 * dossier, mais elle n'EXPIRE jamais et ne se RÉVOQUE pas sans faire tourner
 * `AUTH_SECRET` — ce qui couperait du même coup tous les autres liens signés du
 * CRM.
 *
 * Ces liens-ci acceptent un engagement contractuel et déclenchent un paiement :
 * il faut pouvoir en couper un, le jour où un candidat nous dit « ce n'est pas
 * moi qui ai accepté ». 32 octets d'aléa (256 bits) rangés en base le permettent.
 *
 * ⚠️ Le jeton ne contient AUCUNE information : ni le dossier, ni le nom, ni le
 * montant. Il sert de clé, pas de message — il atterrit dans des boîtes, des
 * journaux de proxy et des antivirus de messagerie.
 */
export function nouveauJeton(): string {
  return randomBytes(32).toString("base64url");
}

/** L'adresse complète à mettre dans l'e-mail. Chaîne vide sans jeton. */
export function lienCandidat(base: string, type: TypeLien, jeton: string): string {
  if (!jeton) return "";
  return `${base.replace(/\/+$/, "")}${CHEMIN[type]}?j=${encodeURIComponent(jeton)}`;
}

/**
 * Tire un lien neuf pour ce dossier et ce type.
 *
 * Ne révoque PAS les précédents, délibérément : un devis renvoyé parce que le
 * premier e-mail est tombé dans les indésirables produit un lien neuf, et
 * l'ancien reste valable — le candidat qui retrouve le vieux message doit
 * tomber sur une page qui marche, pas sur un refus. Les deux ouvrent le même
 * dossier et la même décision ; il n'y a rien à protéger en coupant le premier.
 *
 * Pour couper réellement un lien, c'est `revoquerLiens()`.
 */
export async function creerLien(
  dossierId: string, type: TypeLien, creePar?: string | null,
): Promise<{ ok: boolean; jeton?: string; erreur?: string }> {
  const jeton = nouveauJeton();
  const expire = new Date(Date.now() + DUREE_JOURS[type] * 86_400_000).toISOString();
  const { error } = await supabaseAdmin.from("liens_candidat").insert({
    jeton, type, dossier_id: dossierId, expire_le: expire, cree_par: creePar ?? null,
  });
  if (error) return { ok: false, erreur: error.message };
  return { ok: true, jeton };
}

/** Coupe tous les liens vivants d'un dossier (ou d'un type). Rien n'est supprimé : on révoque. */
export async function revoquerLiens(
  dossierId: string, type?: TypeLien, par?: string | null,
): Promise<void> {
  let q = supabaseAdmin.from("liens_candidat")
    .update({ revoque_le: new Date().toISOString(), revoque_par: par ?? "equipe" })
    .eq("dossier_id", dossierId).is("revoque_le", null);
  if (type) q = q.eq("type", type);
  try { await q; } catch { /* une révocation qui échoue se revoit, elle ne doit rien casser */ }
}

/* ─────────────────────────────────────────────────────────────────────────────
   OUVRIR UN LIEN
   ───────────────────────────────────────────────────────────────────────────── */

export type Lien = {
  id: string;
  type: TypeLien;
  dossierId: string;
  utiliseLe: string | null;
};

/**
 * Résout un jeton, ou refuse.
 *
 * ── UNE SEULE RÉPONSE POUR TOUS LES REFUS ───────────────────────────────────
 * Jeton inconnu, jeton périmé, jeton révoqué, jeton d'un AUTRE type : la
 * fonction rend `null` dans tous les cas. Distinguer les raisons donnerait un
 * oracle, et la règle vaut partout dans ce CRM (cf. `confirmerParJeton` dans
 * lib/rendezVous.ts) : **une réponse ne doit pas dire laquelle des hypothèses
 * est la bonne.**
 *
 * Ici l'enjeu est concret : nos candidats sont des personnes en démarche de
 * naturalisation ou de titre de séjour, et « cette personne a un dossier chez
 * vous » est une information qu'on ne confirme à personne.
 *
 * ⚠️ `type` est vérifié, et ce n'est pas une formalité : sans ce contrôle, le
 * jeton d'un lien de coordonnées — anodin — ouvrirait la page d'acceptation du
 * devis. Un lien ouvre UNE porte.
 */
export async function ouvrirLien(jetonBrut: unknown, type: TypeLien): Promise<Lien | null> {
  const jeton = String(jetonBrut ?? "");
  // 32 octets en base64url font 43 caractères. On écarte le bruit avant d'interroger
  // la base : inutile de faire une requête pour un `?j=1`.
  if (jeton.length < 20 || jeton.length > 200) return null;

  const { data } = await supabaseAdmin
    .from("liens_candidat")
    .select("id, type, dossier_id, utilise_le, expire_le, revoque_le")
    .eq("jeton", jeton)
    .maybeSingle();
  if (!data) return null;

  const l = data as Record<string, unknown>;
  if (String(l.type) !== type) return null;
  if (l.revoque_le) return null;
  if (new Date(String(l.expire_le)).getTime() < Date.now()) return null;

  return {
    id: String(l.id),
    type,
    dossierId: String(l.dossier_id),
    utiliseLe: l.utilise_le ? String(l.utilise_le) : null,
  };
}

/**
 * Horodate l'ACTION sur le lien (voie choisie, devis accepté, paiement enregistré).
 *
 * Le jeton n'est PAS effacé — divergence voulue avec `rendez_vous`, expliquée
 * dans la migration 84 : le candidat rouvre son lien pour relire ce qu'il a
 * accepté ou vérifier que son paiement est passé. Un lien qui meurt au premier
 * clic enverrait les deux au téléphone.
 *
 * `utilise_le` n'est écrit qu'une fois : la première action fait foi.
 */
export async function marquerUtilise(lienId: string): Promise<void> {
  try {
    await supabaseAdmin.from("liens_candidat")
      .update({ utilise_le: new Date().toISOString() })
      .eq("id", lienId).is("utilise_le", null);
  } catch { /* l'horodatage ne doit jamais faire échouer l'action du candidat */ }
}

/* ─────────────────────────────────────────────────────────────────────────────
   LE DOSSIER, TEL QUE LE CANDIDAT A LE DROIT DE LE VOIR
   ───────────────────────────────────────────────────────────────────────────── */

export type ContexteDossier = {
  dossierId: string;
  stagiaireId: string;
  civilite: string | null;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  dateNaissance: string | null;
  villeNaissance: string | null;
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  nationalite: string | null;
  agence: string | null;

  certif: string | null;
  financement: string | null;
  montant: number;
  montantEncaisse: number;
  heuresPrevues: number;
  niveauVise: string | null;
  centre: string | null;
  numeroEdof: string | null;
  dateDebut: string | null;
  dateFin: string | null;

  participationReglee: boolean;
  participationExemptee: boolean;
  exonerationDemandeeLe: string | null;
  devisAccepteLe: string | null;
  verificationIdentite: string | null;
  verificationIdentiteVoie: string | null;

  /** Les séances planifiées, triées. Vide si le planning n'est pas encore posé. */
  seances: { date: string; demiJournee: string; heures: number }[];
};

/**
 * Lit tout ce dont les quatre pages ont besoin, en une requête.
 *
 * ⚠️ La sélection est EXPLICITE et volontairement courte. Pas de `select("*")` :
 * ces objets partent dans des pages publiques, et un `*` ferait entrer dans la
 * vue candidat toute colonne ajoutée plus tard — une remise et son motif, une
 * note interne, un commentaire de relance. Ce qui n'est pas listé ici ne peut
 * pas fuir par accident.
 */
export async function contexteDossier(dossierId: string): Promise<ContexteDossier | null> {
  const { data } = await supabaseAdmin
    .from("dossiers")
    .select(`
      id, stagiaire_id, certif, financement, montant, montant_encaisse,
      heures_prevues, niveau_vise, centre, numero_edof, date_debut, date_fin,
      participation_forfaitaire_reglee, participation_forfaitaire_exemptee,
      exoneration_demandee_le, devis_accepte_le,
      stagiaire:stagiaires!stagiaire_id (
        id, civilite, nom, prenom, email, telephone, date_naissance,
        ville_naissance, adresse, cp, ville, nationalite, agence,
        verification_identite, verification_identite_voie
      ),
      planning ( date_seance, demi_journee, heures )
    `)
    .eq("id", dossierId)
    .maybeSingle();
  if (!data) return null;

  const d = data as Record<string, any>;
  const s = d.stagiaire ?? {};
  const seances = (Array.isArray(d.planning) ? d.planning : [])
    .filter((p: any) => p?.date_seance)
    .map((p: any) => ({
      date: String(p.date_seance),
      demiJournee: String(p.demi_journee ?? ""),
      heures: Number(p.heures ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    dossierId: String(d.id),
    stagiaireId: String(s.id ?? d.stagiaire_id),
    civilite: s.civilite ?? null,
    nom: String(s.nom ?? ""),
    prenom: String(s.prenom ?? ""),
    email: String(s.email ?? ""),
    telephone: s.telephone ?? null,
    dateNaissance: s.date_naissance ?? null,
    villeNaissance: s.ville_naissance ?? null,
    adresse: s.adresse ?? null,
    cp: s.cp ?? null,
    ville: s.ville ?? null,
    nationalite: s.nationalite ?? null,
    agence: s.agence ?? null,

    certif: d.certif ?? null,
    financement: d.financement ?? null,
    montant: Number(d.montant ?? 0),
    montantEncaisse: Number(d.montant_encaisse ?? 0),
    heuresPrevues: Number(d.heures_prevues ?? 0),
    niveauVise: d.niveau_vise ?? null,
    centre: d.centre ?? null,
    numeroEdof: d.numero_edof ?? null,
    dateDebut: d.date_debut ?? null,
    dateFin: d.date_fin ?? null,

    participationReglee: !!d.participation_forfaitaire_reglee,
    participationExemptee: !!d.participation_forfaitaire_exemptee,
    exonerationDemandeeLe: d.exoneration_demandee_le ?? null,
    devisAccepteLe: d.devis_accepte_le ?? null,
    verificationIdentite: s.verification_identite ?? null,
    verificationIdentiteVoie: s.verification_identite_voie ?? null,

    seances,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA PARTICIPATION FORFAITAIRE CPF — CE QUI EST DÛ, ET PAR QUI
   ───────────────────────────────────────────────────────────────────────────── */

export { TICKET_MODERATEUR };

export type EtatParticipation =
  /** Due : CPF, ni réglée ni exonérée. C'est le seul cas où on demande de l'argent. */
  | "due"
  /** Déjà encaissée. La page le confirme et ne propose aucun paiement. */
  | "reglee"
  /** Exonérée par l'équipe sur justificatif. */
  | "exoneree"
  /** Pas un dossier CPF : cette participation n'existe pas pour lui. */
  | "sans_objet";

/**
 * 🔴 NE JAMAIS RÉCLAMER 150 € À QUI N'EN DOIT PAS.
 *
 * La participation forfaitaire au titre du CPF n'est pas un acompte sur notre
 * prix : c'est une participation obligatoire du titulaire, instaurée en 2024, et
 * elle a deux propriétés que le candidat ignore presque toujours — il faut donc
 * les lui ÉCRIRE, pas seulement les appliquer :
 *
 *   1. elle est LA MÊME quel que soit le nombre d'heures. 12 h ou 36 h, c'est
 *      150 €. Le candidat qui a pris le parcours le plus court s'attend à payer
 *      moins et croit à une erreur ;
 *   2. elle n'est PAS DUE par les demandeurs d'emploi inscrits à France Travail,
 *      ni lorsqu'un employeur ou un financeur (OPCO, région) prend le relais.
 *
 * Réclamer ces 150 € à un demandeur d'emploi, ce n'est pas une maladresse : on
 * encaisse une somme qui n'est pas due, sur un financement public, pendant un
 * contrôle DRIEETS. La page VÉRIFIE donc en base avant de demander quoi que ce
 * soit, et offre un chemin de contact à qui se croit exonéré.
 *
 * ⚠️ Le montant vient de `TICKET_MODERATEUR` (lib/inscriptions/regles.ts), seule
 * source. Il existe AUSSI un paramètre `cpf_reste_a_charge` (défaut 150) lu par
 * app/api/documents/completer : deux sources pour un même chiffre, c'est un
 * défaut connu et signalé, pas une invitation à en ajouter une troisième.
 */
export function etatParticipation(c: ContexteDossier): EtatParticipation {
  if (String(c.financement ?? "").toUpperCase() !== "CPF") return "sans_objet";
  if (c.participationExemptee) return "exoneree";
  if (c.participationReglee) return "reglee";
  return "due";
}

/**
 * Le préfixe de la référence transmise à Mollie pour une participation.
 *
 * Elle revient telle quelle dans le webhook et dans l'export Mollie, et c'est
 * elle qui rattache l'argent reçu au dossier.
 *
 * Le préfixe n'est pas décoratif : le CRM a TROIS webhooks Mollie
 * (`/api/paiements/mollie` pour les pré-inscriptions examen,
 * `/api/commande/paiement` pour les commandes composées, et
 * `/api/participation/paiement` pour celle-ci), et chacun cherche sa référence
 * dans SA table. Le préfixe garantit qu'une référence de participation ne soit
 * jamais prise pour autre chose — et surtout que ce webhook-ci REFUSE une
 * référence qui n'est pas la sienne plutôt que de l'interpréter.
 *
 * ⚠️ Vit ici, et non dans la route de paiement : le webhook doit le lire sans
 * importer une autre route. Deux routes qui s'importent l'une l'autre, c'est un
 * cycle qu'on finit par payer au moment du build.
 */
export const PREFIXE_REFERENCE_PARTICIPATION = "participation:";

/* ─────────────────────────────────────────────────────────────────────────────
   MISE EN FORME PARTAGÉE
   ───────────────────────────────────────────────────────────────────────────── */

/** Le financement, dit au candidat dans ses mots et pas dans les nôtres. */
export function financementLisible(v: string | null): string {
  const f = String(v ?? "").toUpperCase();
  if (f === "CPF") return "Compte personnel de formation (CPF)";
  if (f === "OPCO") return "Prise en charge par un OPCO";
  if (f === "POLEEMPLOI" || f === "FRANCETRAVAIL") return "France Travail";
  if (f === "PERSO") return "Financement personnel";
  return v ? String(v) : "À préciser";
}

/**
 * L'intitulé de la formation, pour un candidat.
 *
 * ⚠️ Construit depuis le NIVEAU VISÉ, jamais depuis la durée. Depuis le
 * 17/09/2026 la durée n'identifie plus l'offre : 24 h existe en A2, B1 et B2
 * (cf. lib/inscriptions/regles.ts). Déduire l'offre des heures afficherait au
 * candidat un intitulé qui n'est pas le sien — et c'est l'intitulé qui part sur
 * EDOF.
 *
 * ⚠️ MYSTORY ne dispense AUCUNE formation civique : le contrat d'intégration
 * républicaine relève exclusivement de l'OFII. Rien ici ne doit jamais composer
 * un intitulé qui le laisse croire.
 */
export function intituleFormation(c: ContexteDossier): string {
  const niveau = String(c.niveauVise ?? "").toUpperCase();
  const vise = /^(A1|A2|B1|B2)$/.test(niveau) ? ` — niveau visé ${niveau}` : "";
  const heures = c.heuresPrevues > 0 ? ` · ${c.heuresPrevues} h` : "";
  return `Français langue étrangère, préparation au TEF IRN${vise}${heures}`;
}

/**
 * Le lieu des cours, et son adresse — ou RIEN.
 *
 * Les trois adresses sont celles du pied des e-mails (lib/email.ts), pas des
 * adresses retrouvées de mémoire. Un centre qu'on ne reconnaît pas ne reçoit
 * AUCUNE adresse : mieux vaut n'en afficher aucune qu'en afficher une fausse à
 * quelqu'un qui va s'y rendre. C'est la même règle que `adresseCentre()` dans
 * lib/pagePublique.ts, étendue aux centres de FORMATION (celui-là ne connaît
 * que Rosny, parce qu'il ne sert qu'aux examens).
 */
const ADRESSES: Record<string, string> = {
  gagny: "3 bis avenue de Gagny, 93220 Gagny",
  sarcelles: "18 avenue du 8 Mai 1945, 95200 Sarcelles",
  rosny: "46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois",
};

export function lieuCours(c: ContexteDossier): { nom: string; adresse: string } | null {
  const brut = String(c.centre ?? c.agence ?? "").trim();
  if (!brut) return null;
  const cle = Object.keys(ADRESSES).find((k) => brut.toLowerCase().includes(k));
  if (!cle) return null;
  return { nom: cle.charAt(0).toUpperCase() + cle.slice(1), adresse: ADRESSES[cle] };
}

/**
 * Les dates des cours, en une phrase lisible.
 *
 * Rend `null` quand le planning n'est pas posé : le devis dit alors que les
 * dates seront arrêtées ensemble, ce qui est la vérité. Afficher « — » laisse
 * croire à une information perdue et fait appeler.
 */
export function periodeCours(c: ContexteDossier): string | null {
  if (!c.seances.length) return null;
  const premiere = c.seances[0].date;
  const derniere = c.seances[c.seances.length - 1].date;
  const total = c.seances.reduce((n, s) => n + s.heures, 0);
  const nb = c.seances.length;
  if (premiere === derniere) return `${jourFr(premiere)} · ${total} h`;
  return `du ${jourFr(premiere)} au ${jourFr(derniere)} · ${nb} séances, ${total} h`;
}

/** Une date ISO en français long. Midi forcé : sans lui, un fuseau négatif recule d'un jour. */
export function jourFr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Une date courte, pour une liste de séances. */
export function jourCourtFr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

/** Un horodatage complet, pour « accepté le … ». */
export function momentFr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
}

export function euros(n: number): string {
  return Number(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** Le créneau d'une séance, dans les horaires réels des centres. */
export function creneauLisible(demiJournee: string): string {
  const v = String(demiJournee ?? "").toUpperCase();
  if (v.startsWith("MATIN")) return "matin, 9 h 30 – 12 h 30";
  if (v.startsWith("APRES")) return "après-midi, 14 h – 17 h";
  return "";
}
