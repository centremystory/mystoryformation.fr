/**
 * MYSTORY — /api/rendez-vous  (PUBLIC)
 *
 * GET  : les créneaux d'une agence, avec ceux qui sont déjà pris.
 * POST : réserve un créneau et envoie le récapitulatif.
 *
 * Consigne du dirigeant du 09/10/2026, mot pour mot : « le rendez vous doit être
 * automatique ils choisisent la date, l'heure, l'agence et on reçoit un mail recap
 * juste. » Cette route est le « automatique » : avant elle, /rendez-vous composait
 * un message WhatsApp, et c'est un humain qui transformait la demande en
 * rendez-vous — ou qui l'oubliait.
 *
 * ── TROIS RÈGLES, REPRISES DE /api/inscription-examen ET /api/commande ──────────
 *
 * 1. **TOUT EST REVALIDÉ ICI.** L'agence, la date, l'heure, le motif, la situation
 *    de titre de séjour : rien n'est accepté parce que le formulaire l'a envoyé. Un
 *    champ qui transite par le navigateur est un champ modifiable avec les outils de
 *    développement. Ici il n'y a pas de prix à protéger — mais il y a un créneau, et
 *    un créneau accordé hors des heures d'ouverture, c'est quelqu'un devant une
 *    porte fermée.
 *
 * 2. **C'EST LA BASE QUI ARBITRE LE CRÉNEAU.** Pas un `count` suivi d'un `insert` :
 *    deux candidats peuvent cliquer le même 14 h 30 à la même seconde. On tente
 *    l'insertion et on lit le verdict de l'index unique partiel
 *    (`rendez_vous_un_creneau_une_fois`). Voir `reserverCreneau()`.
 *
 * 3. **TOUT CE QUI VIENT DU CANDIDAT EST ÉCHAPPÉ** par `ech()` avant d'entrer dans
 *    un courriel, et les en-têtes par `enTete()`. Un nom contenant `<` casserait la
 *    mise en forme du message que le secrétariat ouvre tous les jours ; un
 *    `<img src=x onerror=…>` y ferait entrer du balisage actif.
 *
 * ── CE QUI EST DIFFÉRENT D'UNE VENTE ───────────────────────────────────────────
 * Un rendez-vous ne coûte rien et ne s'encaisse pas. Il n'y a donc ni montant à
 * recalculer, ni statut « en_attente » à surveiller : dès que l'insertion passe, le
 * rendez-vous EST pris. En échange, un échec d'envoi du récapitulatif ne l'annule
 * pas — on garde le créneau et on consigne l'erreur dans `recap_erreur`, parce qu'un
 * rendez-vous réservé qu'on aurait détruit pour une panne SMTP serait une place
 * perdue pour tout le monde.
 *
 * ── POURQUOI DU CORS ───────────────────────────────────────────────────────────
 * Le site vitrine est 100 % statique : il ne peut pas recevoir de POST. Il appelle
 * donc cette route depuis le navigateur du candidat, d'une autre origine que le CRM
 * — d'où l'autorisation explicite ci-dessous, limitée aux deux origines du site.
 *
 * C'est une différence assumée avec `/commande`, où le site NAVIGUE vers une page du
 * CRM. Ici, faire sortir le candidat du site pour prendre un rendez-vous gratuit
 * serait un abandon de plus pour rien : il réserve sans quitter la page.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail, adresseValide } from "@/lib/email";
import { ech, enTete } from "@/lib/html";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import { blocLegalComplet } from "@/lib/identiteLegale";
import {
  AGENCES_RDV, agence, disponibilites, creneauOuvert, reserverCreneau,
  rdvAVenirPourEmail, situationTitre, libelleMotif, libelleObjectif,
  jourLisible, heureLisible, heuresDuJour, DUREE_RDV_MINUTES, FENETRE_RDV_JOURS,
  OUVERTURE, FERMETURE, RDV_MAX_PAR_EMAIL, RDV_MAX_PAR_AGENCE_ET_JOUR,
  RDV_MAX_PAR_JOUR_TOUS_CENTRES, DELAI_CONFIRMATION_HEURES,
  rdvDansAgenceLeJour, rdvCreesDernieres24h, lienConfirmation,
} from "@/lib/rendezVous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEL = "06 81 43 16 54";

/**
 * Où part le récapitulatif.
 *
 * 09/10/2026, décision d'Arudhan : « Pour que tout soit centraliser,
 * secretariat@mystoryformation.fr doit être le mail pour l'admin,
 * contact@mystoryformation.fr pour les demandes de contact. » Un rendez-vous réservé
 * est une notification ADMINISTRATIVE : elle va au secrétariat. `contact@` reste
 * l'adresse des demandes entrantes, et l'adresse d'EXPÉDITION visible par le
 * candidat (pilotée par SMTP_FROM / SMTP_REPLY_TO dans lib/email.ts).
 *
 * `EMAIL_CORRECTIONS` reste lu en priorité : c'est la variable que tout le CRM
 * utilise déjà pour rerouter les notifications internes d'un coup.
 */
const DESTINATAIRE_RECAP = process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr";

/**
 * Envoyer aussi une confirmation AU CANDIDAT ?
 *
 * Oui par défaut : un rendez-vous dont on n'a aucune trace écrite s'oublie, et un
 * créneau réservé puis déserté est une place qu'on a refusée à quelqu'un d'autre. Le
 * message lui redit la date, l'adresse exacte et surtout CE QU'IL DOIT APPORTER —
 * c'est tout l'intérêt du triage « titre de séjour ».
 *
 * Pour l'éteindre : passer cette constante à false. Rien d'autre à toucher. Le
 * récapitulatif interne, lui, part dans tous les cas.
 */
const CONFIRMATION_AU_CANDIDAT = true;

/* ─────────────────────────────────────────────────────────────────────────────
   CORS — uniquement les origines du site
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Les origines autorisées à appeler cette route depuis un navigateur.
 *
 * Liste FERMÉE, et pas un `*` : une route qui accepte toutes les origines est une
 * route que n'importe quelle page peut faire appeler par ses visiteurs. Ici le pire
 * resterait du remplissage de créneaux, mais c'est exactement ce qu'on veut éviter.
 * `localhost` y figure pour le développement — il n'existe pas en production.
 */
const ORIGINES_AUTORISEES = new Set([
  "https://www.mystoryformation.fr",
  "https://mystoryformation.fr",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function enTetesCors(req: NextRequest): Record<string, string> {
  const origine = req.headers.get("origin") ?? "";
  if (!ORIGINES_AUTORISEES.has(origine)) return {};
  return {
    "Access-Control-Allow-Origin": origine,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // `Vary` : sans lui, un cache intermédiaire peut servir à une origine la réponse
    // autorisée d'une autre. L'oubli est classique et transforme une liste fermée en
    // liste ouverte au hasard des caches.
    Vary: "Origin",
  };
}

function reponse(corps: unknown, req: NextRequest, status = 200) {
  return NextResponse.json(corps, { status, headers: enTetesCors(req) });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: enTetesCors(req) });
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET — le calendrier d'une agence
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Ne rend QUE des dates et des heures. Aucun nom, aucun téléphone, aucune situation
 * de titre de séjour : la table en contient, cette réponse non. C'est la raison pour
 * laquelle le site ne lit pas `rendez_vous` directement avec la clé publiable, comme
 * il lit `v_sessions_publiques` pour les sessions d'examen.
 */
export async function GET(req: NextRequest) {
  const demandee = req.nextUrl.searchParams.get("agence") ?? "";
  const a = agence(demandee);
  if (!a) {
    return reponse(
      {
        ok: false,
        erreur: "Agence inconnue.",
        agences: AGENCES_RDV.map((x) => ({ code: x.code, nom: x.nom, adresse: x.adresse })),
      },
      req,
      400,
    );
  }

  try {
    const jours = await disponibilites(a.code);
    return reponse(
      {
        ok: true,
        agence: { code: a.code, nom: a.nom, adresse: a.adresse },
        duree_minutes: DUREE_RDV_MINUTES,
        ouverture: OUVERTURE,
        fermeture: FERMETURE,
        fenetre_jours: FENETRE_RDV_JOURS,
        heures_du_jour: heuresDuJour(),
        jours,
      },
      req,
    );
  } catch (e) {
    // Une panne de base ne doit pas rendre la page inutilisable : le site affiche son
    // repli avec le téléphone. Mieux vaut un calendrier vide et un numéro qu'une erreur.
    return reponse(
      { ok: false, erreur: "Le calendrier est momentanément indisponible.", detail: e instanceof Error ? e.message : null },
      req,
      503,
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   POST — réserver
   ───────────────────────────────────────────────────────────────────────────── */

const OBLIGATOIRES = ["agence", "date", "heure", "nom", "prenom", "email", "telephone", "situation"] as const;

const s = (v: unknown) => String(v ?? "").trim();

/**
 * 🔴 LES COMPTEURS SONT EN BASE, PAS EN MÉMOIRE.
 *
 * `/api/commande` et `/api/inscription-examen` comptent dans une `Map` d'instance.
 * C'est une protection en trompe-l'œil, et cette route ne la reprend pas :
 *
 *   — sur Vercel, chaque requête peut tomber sur une AUTRE instance. Un compteur
 *     d'instance ne voit donc qu'une fraction du trafic ;
 *   — et celui-là se VIDE ENTIÈREMENT quand il dépasse 500 entrées
 *     (`recents.clear()`). Il suffit de le faire déborder pour effacer la limite :
 *     le garde-fou devient le levier.
 *
 * `limiteDepassee()` s'appuie sur la table `rate_buckets` et la fonction atomique
 * `rate_hit` : partagée entre instances, et elle survit aux redémarrages. Elle est
 * « fail-open » (si le compteur tombe, on ne bloque pas) — c'est la politique du
 * CRM : la disponibilité prime, et un attaquant ne peut pas provoquer le déblocage.
 *
 * ⚠️ L'IP vient de `ipDeConfiance()` et non de `ipDe()`. `x-forwarded-for` est un
 * en-tête que le client écrit lui-même : en prendre la valeur de GAUCHE, c'est
 * prendre ce que l'appelant a choisi, et une boucle qui la change à chaque requête
 * n'est jamais limitée. On prend celle que le proxy a ajoutée, à droite.
 */

/**
 * 🔴 LA BASE DU LIEN DE CONFIRMATION NE VIENT PAS DE LA REQUÊTE. JAMAIS.
 *
 * Première version de cette fonction, écrite il y a une heure : à défaut d'`APP_URL`,
 * elle retombait sur `x-forwarded-host`, puis `host`. Les deux sont envoyés par le
 * CLIENT. La faille qui en découle est la plus grave qu'ait connue ce chantier, et
 * elle mérite d'être écrite en entier pour que personne ne la réintroduise :
 *
 *   un appelant poste une réservation avec `X-Forwarded-Host: site-pirate.fr` et
 *   l'adresse e-mail d'une VICTIME. Nous envoyons alors, depuis notre propre domaine,
 *   un courriel qui a toute l'apparence d'un message MYSTORY légitime — SPF et DKIM
 *   valides, mise en forme maison — et dont le bouton « Confirmer mon rendez-vous »
 *   mène chez l'attaquant.
 *
 * C'est du hameçonnage dont NOUS sommes l'expéditeur, et le destinataire n'a aucun
 * moyen de s'en apercevoir : le message vient vraiment de nous. Nos candidats sont de
 * surcroît un public qu'on cible beaucoup — titres de séjour, naturalisation — et un
 * faux lien qui leur demande de « confirmer leur identité » marcherait très bien.
 *
 * D'où cette forme, volontairement sans paramètre : il n'y a rien de la requête à
 * lire. `APP_URL` si elle est posée, sinon le domaine du CRM écrit en dur. Le repli
 * en dur est préférable à un échec : sans lui, un oubli de variable d'environnement
 * couperait la confirmation de tous les rendez-vous — et une URL en dur fausse se
 * voit au premier essai, alors qu'une URL empoisonnée ne se voit jamais.
 *
 * ⚠️ `urlDeBase(req)` de lib/appUrl.ts a exactement ce défaut (elle lit `Origin`,
 * puis `x-forwarded-host`, puis `host`) : NE PAS l'utiliser sur une route publique.
 */
function baseCrm(): string {
  return (process.env.APP_URL?.trim() || "https://crm.mystoryformation.fr").replace(/\/+$/, "");
}

async function journal(evenement: string, entiteId: string | null, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "rendez_vous", entite_id: entiteId, evenement,
      nouvelle_valeur: detail, auteur: "site",
    });
  } catch {
    /* le journal ne doit jamais faire échouer une réservation */
  }
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return reponse({ ok: false, erreur: "Requête invalide." }, req, 400);
  }
  const b = corps as Record<string, unknown>;

  // Piège à robots : un humain ne remplit jamais ce champ, il est hors écran.
  // On répond « ok » sans rien écrire — un robot qui voit un refus recommence.
  if (s(b.website)) return reponse({ ok: true, rendez_vous: null }, req);

  // 5 réservations par quart d'heure et par IP : un candidat qui se trompe deux fois
  // reste servi, une boucle est arrêtée au sixième essai.
  const ip = ipDeConfiance(req);
  if (await limiteDepassee(`rdv:ip:${ip}`, 5, 900)) {
    return reponse(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL}.` },
      req,
      429,
    );
  }

  const manquants = OBLIGATOIRES.filter((c) => !s(b[c]));
  if (manquants.length) {
    return reponse({ ok: false, erreur: "Merci de remplir tous les champs obligatoires." }, req, 400);
  }

  const a = agence(s(b.agence));
  if (!a) return reponse({ ok: false, erreur: "Choisissez l'un de nos trois centres." }, req, 400);

  const situation = situationTitre(s(b.situation));
  if (!situation) {
    return reponse(
      { ok: false, erreur: "Indiquez où en est votre titre de séjour : c'est ce qui détermine la marche à suivre." },
      req,
      400,
    );
  }

  // Le motif et l'objectif sont facultatifs, mais s'ils sont donnés ils doivent
  // appartenir aux listes : une valeur libre finirait telle quelle dans un courriel
  // et dans le CRM, où plus personne ne saurait la regrouper.
  const motif = s(b.motif);
  if (motif && !libelleMotif(motif)) {
    return reponse({ ok: false, erreur: "Démarche inconnue." }, req, 400);
  }
  const objectif = s(b.objectif);
  if (objectif && !libelleObjectif(objectif)) {
    return reponse({ ok: false, erreur: "Objectif inconnu." }, req, 400);
  }

  const email = s(b.email).toLowerCase();
  if (!adresseValide(email)) {
    return reponse(
      { ok: false, erreur: "Cette adresse e-mail ne semble pas valide — c'est par là que part votre confirmation." },
      req,
      400,
    );
  }

  const date = s(b.date);
  const heure = s(b.heure);
  // 🔴 Le créneau est REVALIDÉ contre la grille d'ouverture. Sans ce contrôle, une
  // requête fabriquée à la main poserait un rendez-vous un dimanche à 22 h.
  if (!creneauOuvert(date, heure)) {
    return reponse(
      {
        ok: false,
        erreur:
          "Ce créneau n'est plus proposé. Nous recevons du lundi au samedi, de 9 h 30 à 17 h 30 — choisissez un autre horaire dans la liste.",
        rafraichir: true,
      },
      req,
      409,
    );
  }

  // Plafond par adresse : la limite par IP arrête un formulaire qui s'emballe, celle-ci
  // arrête quelqu'un qui réserve tous les créneaux de la semaine depuis son téléphone.
  // Doublée d'un compteur de débit en base sur la même adresse : sans lui, il suffirait
  // d'annuler pour recommencer indéfiniment — et chaque essai envoie un courriel.
  if (
    (await rdvAVenirPourEmail(email)) >= RDV_MAX_PAR_EMAIL ||
    (await limiteDepassee(`rdv:email:${email}`, RDV_MAX_PAR_EMAIL, 86_400))
  ) {
    return reponse(
      {
        ok: false,
        erreur: `Vous avez déjà ${RDV_MAX_PAR_EMAIL} rendez-vous à venir avec cette adresse. Appelez-nous au ${TEL} pour en déplacer un.`,
      },
      req,
      429,
    );
  }

  /* 🔴 LA SOUPAPE QUI PROTÈGE L'AGENDA. Les limites ci-dessus visent un appelant ;
     celles-ci bornent le DÉGÂT, quel que soit l'appelant et quel que soit le nombre
     d'adresses IP qu'il contrôle. C'est le point faible qu'une revue de sécurité a
     relevé : un agenda saturé de faux rendez-vous, c'est du chiffre d'affaires perdu
     que personne ne voit venir avant le jour J.

     Elles sont comptées EN BASE, donc vraies pour toutes les instances. */
  if ((await rdvDansAgenceLeJour(a.code, date)) >= RDV_MAX_PAR_AGENCE_ET_JOUR) {
    return reponse(
      {
        ok: false,
        erreur: `Cette journée est complète en ligne à ${a.nom}. Choisissez un autre jour, ou appelez-nous au ${TEL} — il reste souvent de la place au téléphone.`,
        rafraichir: true,
      },
      req,
      409,
    );
  }
  if ((await rdvCreesDernieres24h()) >= RDV_MAX_PAR_JOUR_TOUS_CENTRES) {
    /* Ce plafond borne aussi le nombre de courriels partant vers des adresses non
       prouvées : c'est la réputation d'expéditeur du domaine qu'il protège, donc
       l'arrivée des convocations d'examen. Il ne se verra que si quelque chose ne va
       pas — le volume normal en est très loin. */
    await journal("rdv_plafond_journalier_atteint", null, { agence: a.code, date, heure: s(b.heure), ip });
    return reponse(
      { ok: false, erreur: `La réservation en ligne est momentanément indisponible. Appelez-nous au ${TEL}, nous prenons votre rendez-vous tout de suite.` },
      req,
      503,
    );
  }

  const nom = s(b.nom);
  const prenom = s(b.prenom);
  const telephone = s(b.telephone);

  const pris = await reserverCreneau({
    agence: a.code, date, heure,
    civilite: s(b.civilite), nom, prenom, email, telephone,
    motif, objectif, situation: situation.id,
    // Le message libre est borné : au-delà, ce n'est plus un complément, c'est un
    // dépôt de contenu dans notre base et dans notre boîte.
    message: s(b.message).slice(0, 1000),
  });

  if (!pris.ok) {
    if (pris.raison === "pris") {
      await journal("rdv_creneau_deja_pris", null, { agence: a.code, date, heure, email });
      return reponse(
        {
          ok: false,
          erreur: "Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez-en un autre, la liste est à jour.",
          rafraichir: true,
        },
        req,
        409,
      );
    }
    await journal("rdv_echec_enregistrement", null, { agence: a.code, date, heure, email, detail: pris.detail });
    return reponse(
      { ok: false, erreur: `Nous n'avons pas pu enregistrer votre rendez-vous. Appelez-nous au ${TEL}, nous le prenons avec vous.` },
      req,
      500,
    );
  }

  const ref = pris.id;
  await journal("rdv_reserve_en_ligne", ref, { agence: a.code, date, heure, email, situation: situation.id });

  const contexte = {
    ref, agence: a, date, heure, civilite: s(b.civilite), nom, prenom, email, telephone,
    motif, objectif, situation, message: s(b.message).slice(0, 1000),
    lienConfirmer: lienConfirmation(baseCrm(), ref),
  };

  /* Le récapitulatif interne part TOUT DE SUITE, avant toute confirmation du
     candidat — et c'est un choix.
     Le dirigeant demande « un mail recap » ; un formulaire rempli est un client, et
     attendre un clic pour nous prévenir, c'est accepter de perdre silencieusement
     tous ceux qui ne cliquent pas. Le message dit clairement si l'adresse a été
     confirmée ou non, pour que le secrétariat sache ce qu'il a sous les yeux.
     Il part vers NOTRE boîte : il ne pose aucun risque de réputation. */
  const envoi = await recapitulatifInterne(contexte);
  await supabaseAdmin.from("rendez_vous").update(
    envoi.ok ? { recap_envoye_le: new Date().toISOString() } : { recap_erreur: envoi.erreur ?? "échec inconnu" },
  ).eq("id", ref);

  if (CONFIRMATION_AU_CANDIDAT) {
    const c = await confirmationCandidat(contexte);
    if (c.ok) {
      await supabaseAdmin.from("rendez_vous")
        .update({ confirmation_envoyee_le: new Date().toISOString() }).eq("id", ref);
    }
  }

  /* 🔴 On rend « ok » MÊME SI un courriel a échoué : le créneau est pris, c'est un
     fait. Dire au candidat que ça n'a pas marché le ferait recommencer et occuper un
     second créneau. L'échec est tracé dans `recap_erreur` — c'est au secrétariat de
     le rattraper, pas au candidat.

     ⚠️ MAIS si la confirmation n'a pas pu partir (pas de secret de signature, panne
     SMTP), le rendez-vous se périmerait au bout de `DELAI_CONFIRMATION_HEURES` sans
     que personne ne puisse le confirmer. Dans ce cas on le confirme NOUS-MÊMES : le
     récapitulatif est parti au secrétariat, l'intention est donc tracée chez nous, et
     il vaut mieux un rendez-vous ferme à rappeler qu'un créneau qui disparaît. */
  const confirmationPossible = CONFIRMATION_AU_CANDIDAT && !!contexte.lienConfirmer;
  if (!confirmationPossible) {
    await supabaseAdmin.from("rendez_vous")
      .update({ confirme_le: new Date().toISOString() }).eq("id", ref);
    await journal("rdv_confirme_doffice", ref, {
      motif: contexte.lienConfirmer ? "confirmation_au_candidat_desactivee" : "aucun_secret_de_signature",
    });
  }

  return reponse(
    {
      ok: true,
      rendez_vous: {
        reference: ref,
        agence: a.nom,
        adresse: a.adresse,
        jour: jourLisible(date),
        heure: heureLisible(heure),
        duree_minutes: DUREE_RDV_MINUTES,
        a_apporter: situation.aApporter,
        marche_a_suivre: situation.marcheASuivre,
      },
      /* Le site s'en sert pour dire au candidat ce qu'il lui reste à faire : un
         rendez-vous « à confirmer » doit être annoncé comme tel, sinon il croit en
         avoir fini et son créneau retombe douze heures plus tard. */
      a_confirmer: confirmationPossible,
      delai_confirmation_heures: DELAI_CONFIRMATION_HEURES,
      // Visible seulement dans la réponse technique : le candidat n'a pas à savoir
      // que notre serveur de messagerie a eu un hoquet, mais nos journaux, oui.
      recap_envoye: envoi.ok,
    },
    req,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LES COURRIELS
   ───────────────────────────────────────────────────────────────────────────── */

type Contexte = {
  ref: string;
  agence: { code: string; nom: string; adresse: string; centreExamen: boolean };
  date: string; heure: string;
  civilite: string; nom: string; prenom: string; email: string; telephone: string;
  motif: string; objectif: string;
  situation: { id: string; option: string; marcheASuivre: string; aApporter: string };
  message: string;
  /** Lien signé de confirmation. Vide si `AUTH_SECRET` manque — on ne fabrique
   *  alors AUCUN lien plutôt qu'un lien forgeable. */
  lienConfirmer: string;
};

/**
 * Le pied légal conforme, en HTML.
 *
 * ⚠️ Il s'AJOUTE au pied de `gabaritEmail()`, qui est incomplet (ni RCS, ni siège,
 * ni TVA — cf. `blocLegalComplet()` dans lib/identiteLegale.ts). Reprendre le
 * gabarit lui-même touche une quarantaine d'appelants : c'est un chantier à part.
 * En attendant, mieux vaut un bloc conforme en double qu'un bloc incomplet seul.
 */
function piedConforme(): string {
  return `<p style="margin-top:18px;padding-top:12px;border-top:1px solid #e6e9f0;color:#8a919d;font-size:11px;line-height:1.5">
    ${ech(blocLegalComplet())}
  </p>`;
}

/** Une ligne « Libellé : valeur » du tableau récapitulatif. Valeur toujours échappée. */
function ligne(libelle: string, valeur: string): string {
  return `<tr>
    <td style="padding:6px 10px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${libelle}</td>
    <td style="padding:6px 0;color:#1f2430;font-size:14px"><b>${ech(valeur)}</b></td>
  </tr>`;
}

/**
 * « on reçoit un mail recap juste » — exactement ça, et rien de plus.
 *
 * L'ordre des lignes n'est pas décoratif : le créneau et le lieu d'abord (c'est ce
 * qu'on note dans l'agenda), puis qui vient, puis ce qu'il faut préparer. Quelqu'un
 * qui lit ce message sur son téléphone, entre deux candidats, doit savoir en une
 * seconde QUAND et OÙ. Le reste peut attendre la deuxième ligne.
 */
async function recapitulatifInterne(c: Contexte): Promise<{ ok: boolean; erreur?: string }> {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;
  const objet = enTete(
    `Rendez-vous réservé en ligne — ${c.nom.toUpperCase()} ${c.prenom} · ${c.agence.nom} · ${quand}`,
  );

  // Alerte utile, et uniquement quand elle sert : les examens ont lieu à Rosny
  // seulement. Quelqu'un qui vient « seulement passer l'examen » à Gagny ou à
  // Sarcelles doit être redirigé AVANT de se déplacer.
  const alerteExamen =
    c.objectif === "examen" && !c.agence.centreExamen
      ? `<p style="background:#fff4e5;border-left:3px solid #f59e0b;padding:10px 12px;border-radius:6px;font-size:13px">
           ⚠️ Il vient « seulement passer l'examen » mais a choisi <b>${ech(c.agence.nom)}</b>, qui est un centre
           de <b>formation</b>. Les examens se passent uniquement à Rosny-sous-Bois : à lui dire au rappel.
         </p>`
      : "";

  return envoyerEmail({
    a: DESTINATAIRE_RECAP,
    objet,
    html: gabaritEmail(
      "Rendez-vous pris sur le site",
      `<p style="font-size:15px;margin-top:0">Un candidat a réservé seul son rendez-vous sur
        <b>mystoryformation.fr/rendez-vous</b>. Rien à faire de notre côté : la place est prise.</p>

       ${c.lienConfirmer
          ? `<p style="background:#f4f6fb;border-left:3px solid #9aa1ad;padding:10px 12px;border-radius:6px;font-size:12.5px;color:#4b5563">
               ⏳ <b>Adresse pas encore confirmée.</b> Un lien de confirmation lui a été envoyé.
               Sans clic de sa part sous ${DELAI_CONFIRMATION_HEURES} h, le créneau est automatiquement
               rendu et il faudra le reprendre avec lui. Si vous l'avez au téléphone et que le
               rendez-vous est sûr, dites-le-lui : un clic suffit.
             </p>`
          : ""}

       <table style="border-collapse:collapse;width:100%">
         ${ligne("Quand", `${quand} (${DUREE_RDV_MINUTES} min)`)}
         ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
         ${ligne("Qui", `${c.civilite ? c.civilite + " " : ""}${c.nom.toUpperCase()} ${c.prenom}`)}
         ${ligne("Téléphone", c.telephone)}
         ${ligne("E-mail", c.email)}
         ${c.motif ? ligne("Sa démarche", libelleMotif(c.motif) ?? c.motif) : ""}
         ${c.objectif ? ligne("Ce qu'il cherche", libelleObjectif(c.objectif) ?? c.objectif) : ""}
         ${ligne("Titre de séjour", c.situation.option)}
       </table>

       ${alerteExamen}

       <p style="font-size:13px;margin-bottom:4px"><b>Marche à suivre qui lui a été indiquée</b></p>
       <p style="font-size:13px;color:#4b5563;margin-top:0">${ech(c.situation.marcheASuivre)}</p>

       <p style="font-size:13px;margin-bottom:4px"><b>Ce qu'il doit apporter</b> (nous le lui avons écrit)</p>
       <p style="font-size:13px;color:#4b5563;margin-top:0">${ech(c.situation.aApporter)}</p>

       ${c.message
          ? `<p style="font-size:13px;margin-bottom:4px"><b>Son message</b></p>
             <p style="font-size:13px;color:#4b5563;margin-top:0;white-space:pre-wrap">${ech(c.message)}</p>`
          : ""}

       <p style="color:#9aa1ad;font-size:11px;margin-top:16px">Rendez-vous ${ech(c.ref)}</p>
       ${piedConforme()}`,
    ),
    entite: "rendez_vous",
    entiteId: c.ref,
    auteur: "site",
  });
}

/**
 * La confirmation au candidat.
 *
 * Elle ne sert pas à faire joli : elle lui redit l'adresse EXACTE (nos trois centres
 * se confondent facilement) et ce qu'il doit apporter. Un candidat qui vient sans sa
 * carte repart avec un second rendez-vous — et nous avons occupé deux créneaux pour
 * un seul dossier.
 *
 * Le lien WhatsApp y figure, discrètement, pour une question. Jamais comme chemin
 * principal : il a déjà réservé, il n'y a plus rien à négocier.
 */
async function confirmationCandidat(c: Contexte): Promise<{ ok: boolean; erreur?: string }> {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;
  return envoyerEmail({
    a: c.email,
    objet: enTete(
      c.lienConfirmer
        ? `Confirmez votre rendez-vous MYSTORY — ${quand}, ${c.agence.nom}`
        : `Votre rendez-vous MYSTORY — ${quand}, ${c.agence.nom}`,
    ),
    html: gabaritEmail(
      c.lienConfirmer ? "Un clic et c'est confirmé" : "Votre rendez-vous est confirmé",
      `<p style="font-size:15px;margin-top:0">Bonjour ${ech(c.prenom)},</p>
       ${c.lienConfirmer
          ? `<p>Votre créneau est <b>retenu</b>. Il ne manque qu'un clic pour le rendre définitif —
               c'est ce qui nous permet de vérifier que cette adresse est bien la vôtre.</p>
             <p style="text-align:center;margin:22px 0">
               <a href="${ech(c.lienConfirmer)}"
                  style="display:inline-block;background:#2F72DE;color:#ffffff;text-decoration:none;
                         padding:14px 28px;border-radius:999px;font-size:15px;font-weight:bold">
                 Confirmer mon rendez-vous
               </a>
             </p>
             <p style="font-size:12.5px;color:#6b7280;text-align:center;margin-top:-8px">
               Sans confirmation sous ${DELAI_CONFIRMATION_HEURES} heures, le créneau est rendu à
               quelqu'un d'autre.
             </p>`
          : `<p>Votre rendez-vous est bien enregistré. Vous n'avez rien d'autre à faire :
               nous vous attendons.</p>`}

       <table style="border-collapse:collapse;width:100%">
         ${ligne("Quand", `${quand}`)}
         ${ligne("Combien de temps", `environ ${DUREE_RDV_MINUTES} minutes`)}
         ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
       </table>

       <p style="background:#eef3fd;border-left:3px solid #2F72DE;padding:12px 14px;border-radius:6px;font-size:14px">
         <b>À apporter :</b> ${ech(c.situation.aApporter)}.
       </p>

       <p style="font-size:13px;color:#4b5563">${ech(c.situation.marcheASuivre)}</p>

       <p style="font-size:13px;color:#6b7280">Un empêchement, une question&nbsp;?
         Écrivez-nous en répondant à ce message, appelez le ${TEL}, ou
         <a href="https://wa.me/33681431654" style="color:#2F72DE">écrivez-nous sur WhatsApp</a>.
         Prévenez-nous si vous ne pouvez pas venir&nbsp;: votre créneau servira à quelqu'un d'autre.</p>

       <p style="color:#9aa1ad;font-size:11px;margin-top:16px">Référence ${ech(c.ref)}</p>
       ${piedConforme()}`,
    ),
    entite: "rendez_vous",
    entiteId: c.ref,
    auteur: "site",
  });
}
