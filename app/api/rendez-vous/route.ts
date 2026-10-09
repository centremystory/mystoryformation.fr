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
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, adresseValide } from "@/lib/email";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import {
  htmlRecapInterne, objetRecapInterne,
  htmlConfirmationCandidat, objetConfirmationCandidat,
  type Contexte,
} from "@/lib/rendezVousEmails";
import {
  AGENCES_RDV, agence, disponibilites, creneauOuvert, reserverCreneau,
  situationTitre,
  jourLisible, heureLisible, heuresDuJour, DUREE_RDV_MINUTES, FENETRE_RDV_JOURS,
  OUVERTURE, FERMETURE, RDV_MAX_PAR_AGENCE_ET_JOUR, DELAI_CONFIRMATION_HEURES,
  RDV_MAIL_MAX_PAR_JOUR, RDV_MAIL_MAX_PAR_EMAIL,
  rdvDansAgenceLeJour, lienConfirmation, libelleMotif, libelleObjectif,
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
    await journal("rdv_calendrier_indisponible", null, {
      agence: a.code, detail: e instanceof Error ? e.message : "inconnue",
    });
    // Une panne de base ne doit pas rendre la page inutilisable : le site affiche son
    // repli avec le téléphone. Mieux vaut un calendrier vide et un numéro qu'une erreur.
    return reponse(
      /* ⚠️ On ne rend PAS le message d'erreur de la base. Il nomme des tables, des
         colonnes et parfois des contraintes : c'est une carte de notre schéma
         offerte à qui provoque la panne. Il est journalisé, pas publié. */
      { ok: false, erreur: "Le calendrier est momentanément indisponible." },
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
 * L'empreinte d'une adresse, pour servir de clé de compteur.
 *
 * `rate_buckets` est une table de comptage, pas un fichier de clients : y ranger des
 * adresses e-mail en clair y accumulerait des données personnelles dont on n'a aucun
 * besoin — il suffit de savoir que « c'est la même adresse que tout à l'heure ».
 * Une empreinte le dit, et ne dit rien d'autre.
 */
const empreinte = (v: string) => createHash("sha256").update(v).digest("base64url").slice(0, 24);

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

  const email = s(b.email).toLowerCase().slice(0, 254);
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

  /* ─────────────────────────────────────────────────────────────────────────────
     🔴 CE QUI BORNE LE DÉGÂT — et ce qui a été RETIRÉ d'ici.

     Deux garde-fous se trouvaient à cet endroit. Les deux ont été retirés après
     revue, et il faut dire pourquoi pour que personne ne les remette :

     — « vous avez déjà 3 rendez-vous à venir avec cette adresse » (429). C'était un
       ORACLE : poster l'adresse de quelqu'un et lire la réponse apprenait s'il a
       rendez-vous chez nous. Nos candidats sont des personnes en démarche de
       naturalisation ; c'est une information qu'on ne confirme à personne ;

     — « au-delà de 40 réservations par 24 h, tous centres confondus » (503). C'était
       un COUPE-CIRCUIT à la disposition de n'importe qui : atteindre ce plafond seul
       fermait la réservation en ligne pour tout le monde. Un plafond doit porter sur
       l'abuseur, jamais sur le service.

     Ce qui reste, et qui suffit :
       — la limite par IP, plus haut (5 / 15 min, compteur en base, IP de confiance) ;
       — le plafond PAR AGENCE ET PAR JOUR, ci-dessous : il laisse toujours ouverts
         les autres jours et les deux autres agences, donc il ne ferme jamais le
         service. Il borne le dégât à 8 créneaux par agence et par jour ;
       — la PÉREMPTION des réservations non confirmées (12 h) : un créneau pris par
         quelqu'un qui ne lit pas sa boîte se rend tout seul.
     ───────────────────────────────────────────────────────────────────────────── */
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

  /* LE BUDGET DE COURRIELS. Il ne refuse AUCUNE réservation — il décide seulement si
     la confirmation part au candidat. C'est ce qui protège la réputation
     d'expéditeur du domaine, donc l'arrivée des convocations d'examen (panne vécue
     les 09 et 10/09/2026), sans donner à personne le moyen de fermer le service.

     Quand il est atteint : le rendez-vous est enregistré, le récapitulatif part
     quand même au secrétariat — qui a le téléphone du candidat — et le créneau
     reste périssable faute de confirmation. Service dégradé sur l'ENVOI, jamais sur
     la réservation.

     ⚠️ Les deux compteurs sont incrémentés ici, à chaque tentative : c'est voulu.
     Compter les envois réussis seulement laisserait une boucle d'échecs relancer
     autant d'envois qu'elle veut. */
  const budgetMail =
    !(await limiteDepassee("rdv:mail:global", RDV_MAIL_MAX_PAR_JOUR, 86_400)) &&
    !(await limiteDepassee(`rdv:mail:${empreinte(email)}`, RDV_MAIL_MAX_PAR_EMAIL, 86_400));

  /* Les champs libres sont BORNÉS. Aucune de ces colonnes n'a de longueur maximale
     en base, et rien n'oblige un appelant à envoyer des valeurs raisonnables : sans
     ces bornes, un seul POST peut ranger plusieurs mégaoctets dans la table et dans
     le courriel que le secrétariat ouvre. Les longueurs sont généreuses — personne
     n'a un nom de 80 caractères — et ce qui dépasse est coupé, pas refusé : on ne
     bloque pas une réservation pour un numéro de téléphone mal collé. */
  const nom = s(b.nom).slice(0, 80);
  const prenom = s(b.prenom).slice(0, 80);
  const telephone = s(b.telephone).slice(0, 30);
  const civilite = s(b.civilite).slice(0, 12);
  const messageLibre = s(b.message).slice(0, 1000);

  const pris = await reserverCreneau({
    agence: a.code, date, heure,
    civilite, nom, prenom, email, telephone,
    motif, objectif, situation: situation.id,
    message: messageLibre,
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

  /* Le lien de confirmation porte le JETON, jamais l'identifiant du rendez-vous :
     32 octets d'aléa tirés à l'insertion, uniques, périssables, effacés après usage
     (voir `nouveauJeton` et `confirmerParJeton`). Une signature de l'identifiant —
     ce qu'il y avait d'abord ici — ne périme ni ne se révoque. */
  const contexte: Contexte = {
    ref, agence: a, date, heure, civilite, nom, prenom, email, telephone,
    motif, objectif, situation, message: messageLibre,
    lienConfirmer: budgetMail ? lienConfirmation(baseCrm(), pris.jeton ?? "") : "",
    /* Le secrétariat doit savoir s'il doit rappeler : quand le budget d'envoi est
       atteint, le candidat ne reçoit RIEN et son créneau se rendra dans 12 heures.
       Sans cette ligne dans le récapitulatif, personne ne le saurait. */
    aRappeler: CONFIRMATION_AU_CANDIDAT && !budgetMail,
  };

  /* Le récapitulatif interne part TOUT DE SUITE, avant toute confirmation du
     candidat — et c'est un choix.
     Le dirigeant demande « un mail recap » ; un formulaire rempli est un client, et
     attendre un clic pour nous prévenir, c'est accepter de perdre silencieusement
     tous ceux qui ne cliquent pas. Le message dit clairement si l'adresse a été
     confirmée ou non, pour que le secrétariat sache ce qu'il a sous les yeux.
     Il part vers NOTRE boîte : il ne pose aucun risque de réputation. */
  const envoi = await envoyerEmail({
    a: DESTINATAIRE_RECAP,
    objet: objetRecapInterne(contexte),
    html: htmlRecapInterne(contexte),
    entite: "rendez_vous", entiteId: ref, auteur: "site",
  });
  await supabaseAdmin.from("rendez_vous").update(
    envoi.ok ? { recap_envoye_le: new Date().toISOString() } : { recap_erreur: envoi.erreur ?? "échec inconnu" },
  ).eq("id", ref);

  const confirmationPossible = CONFIRMATION_AU_CANDIDAT && !!contexte.lienConfirmer;

  if (confirmationPossible) {
    const c = await envoyerEmail({
      a: contexte.email,
      objet: objetConfirmationCandidat(contexte),
      html: htmlConfirmationCandidat(contexte),
      entite: "rendez_vous", entiteId: ref, auteur: "site",
    });
    if (c.ok) {
      await supabaseAdmin.from("rendez_vous")
        .update({ confirmation_envoyee_le: new Date().toISOString() }).eq("id", ref);
    }
  } else if (!CONFIRMATION_AU_CANDIDAT) {
    /* La confirmation est éteinte par configuration : sans elle, le rendez-vous se
       périmerait au bout de `DELAI_CONFIRMATION_HEURES` sans que PERSONNE ne puisse
       le confirmer. On le confirme donc nous-mêmes. C'est le seul cas où l'on
       renonce à la preuve d'adresse, et il est le fruit d'une décision interne, pas
       d'une requête du dehors. */
    await supabaseAdmin.from("rendez_vous")
      .update({ confirme_le: new Date().toISOString() }).eq("id", ref);
    await journal("rdv_confirme_doffice", ref, { motif: "confirmation_au_candidat_desactivee" });
  } else {
    /* 🔴 LE BUDGET D'ENVOI EST ATTEINT (ou aucun jeton n'a pu être tiré). On
       n'écrit PAS `confirme_le` : le créneau reste périssable, et il se rendra tout
       seul dans 12 heures. C'est précisément ce qu'on veut sous abus — sinon un
       attaquant obtiendrait des rendez-vous FERMES en épuisant le budget de
       courriels, c'est-à-dire l'inverse du but.

       Le candidat légitime pris dans cette fenêtre n'est pas perdu pour autant : le
       récapitulatif est parti au secrétariat avec son téléphone, et l'alerte
       ci-dessous dit qu'il faut l'appeler. */
    await journal("rdv_confirmation_non_envoyee", ref, { motif: "budget_envoi_atteint" });
  }

  /* 🔴 On rend « ok » MÊME SI un courriel a échoué : le créneau est pris, c'est un
     fait. Dire au candidat que ça n'a pas marché le ferait recommencer et occuper un
     second créneau. L'échec est tracé dans `recap_erreur` — c'est au secrétariat de
     le rattraper, pas au candidat. */

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
