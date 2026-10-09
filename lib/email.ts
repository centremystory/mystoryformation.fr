/**
 * MYSTORY — lib/email.ts  (envoi d'emails sortants via SMTP IONOS)
 * Expéditeur : contact@mystoryformation.fr (boîte IONOS de l'organisme — toute l'équipe
 * voit les réponses). IONOS gère déjà SPF/DKIM du domaine → emails bien authentifiés.
 *
 * DRAPEAU : si les identifiants SMTP (SMTP_USER / SMTP_PASS) sont absents des variables
 * d'environnement Vercel, l'envoi est désactivé proprement (journalisé, jamais bloquant).
 *
 * 17/09/2026 — décision d'Arudhan : tout le courrier d'EXPLOITATION (convocations,
 * attestations, résultats de test, relances) part et revient au SECRÉTARIAT.
 * `contact@` est réservé aux demandes entrantes des prospects, et reste l'adresse
 * publiée pour les droits RGPD — c'est celle de la politique de confidentialité,
 * elle ne change pas dans les mentions légales.
 *
 * ⚠️ SMTP_USER est le compte AUTHENTIFIÉ auprès d'IONOS. Il commande ce que le
 * serveur accepte comme expéditeur : envoyer « from: secretariat@ » avec un login
 * « contact@ » est refusé. Les trois variables se changent ENSEMBLE.
 *
 * Variables Vercel attendues :
 *   SMTP_USER  = secretariat@mystoryformation.fr (obligatoire — le compte authentifié)
 *   SMTP_PASS  = mot de passe de CETTE boîte     (obligatoire)
 *   SMTP_HOST  = smtp.ionos.fr                   (défaut : smtp.ionos.fr)
 *   SMTP_PORT  = 465                             (défaut : 465)
 *   SMTP_SECURE= true                            (défaut : true pour 465 ; false => STARTTLS 587)
 *   SMTP_FROM  = "MYSTORY Formation <secretariat@mystoryformation.fr>"
 *   SMTP_REPLY_TO = secretariat@mystoryformation.fr
 *
 * Chaque tentative (envoyée, échouée ou désactivée) est tracée dans `journal`.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consignerIncident } from "@/lib/incidents";
import { identiteLegale } from "@/lib/identiteLegale";
import { ech } from "@/lib/html";

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.ionos.fr";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "465");
const SMTP_SECURE = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
// Défauts volontairement laissés sur contact@ : ils ne servent que si les variables
// Vercel sont absentes. Basculer le défaut sans avoir changé SMTP_USER ferait refuser
// TOUS les envois par IONOS. La bascule se fait dans les variables, pas ici.
const EXPEDITEUR = process.env.SMTP_FROM ?? "MYSTORY Formation <contact@mystoryformation.fr>";
const REPONDRE_A = process.env.SMTP_REPLY_TO ?? "contact@mystoryformation.fr";

export const EMAIL_ACTIF = !!(SMTP_USER && SMTP_PASS);

/**
 * Une adresse saisie au kiosque peut être n'importe quoi. Le 18/09/2026, un candidat
 * a tapé « daadaaaladin gmail.com » — sans arobase : nodemailer a rendu « No recipients
 * defined », une erreur qui ne dit rien de la cause. On valide donc en amont, et on
 * journalise l'adresse fautive : c'est elle qu'il faut corriger, pas le serveur.
 */
export function adresseValide(v: unknown): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v ?? "").trim());
}

export interface PieceJointe {
  nom: string;      // ex. "Convocation_TEF_DUPONT.pdf"
  contenu: Buffer;  // contenu binaire (PDF…)
}

export interface EnvoiEmail {
  a: string;
  objet: string;
  html: string;
  piecesJointes?: PieceJointe[];
  /** Copie CACHEE. Le destinataire ne la voit pas : on garde une trace interne
   *  de ce qui est reellement parti, sans exposer l'adresse au candidat. */
  copieCachee?: string;
  // Traçabilité journal
  entite?: string;    // ex. "ventes_examen", "dossiers"
  entiteId?: string;
  auteur?: string;
}

async function journaliser(evenement: string, e: EnvoiEmail, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: e.entite ?? "email",
      entite_id: e.entiteId ?? null,
      evenement,
      nouvelle_valeur: { a: e.a, objet: e.objet, ...detail },
      auteur: e.auteur ?? null,
    });
  } catch {
    // Le journal ne doit jamais faire échouer l'envoi lui-même.
  }
}

// Transporteur réutilisé entre invocations chaudes de la même fonction.
let _transport: Transporter | null = null;
function transport(): Transporter {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // 17/09/2026 — délais explicites. Sans eux, nodemailer attend le défaut de
      // Node (deux minutes), et une fonction Vercel est tuée avant : l'envoi
      // échoue sans qu'aucune erreur ne soit journalisée. Mieux vaut renoncer
      // vite et réessayer que disparaître en silence.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 25_000,
    });
  }
  return _transport;
}

/**
 * Une panne de réseau est-elle passagère ?
 *
 * 18/09/2026 — CE MOTIF A ÉTÉ ÉCRIT DEUX FOIS, et la première version était
 * fausse. Elle listait des codes d'erreur Node (ETIMEDOUT, ECONNRESET…) au lieu
 * des messages que nodemailer produit réellement. Sur les quatre échecs observés
 * en production — « Connection timeout », « Timeout », « Unexpected socket
 * close », « 421 … command timeout » — un seul correspondait. Trois envois sur
 * quatre n'étaient donc jamais réessayés, alors que le second essai existait.
 *
 * La leçon vaut d'être écrite : un motif de reprise se construit à partir des
 * messages relevés dans le journal, jamais depuis la documentation.
 *
 * Le 421 d'IONOS mérite une mention : « Service closing transmission channel »
 * est un refus TEMPORAIRE au sens de la norme SMTP — le serveur dit « pas
 * maintenant », pas « jamais ». Il se réessaie.
 *
 * Restent exclus, et c'est volontaire : les adresses invalides et les refus
 * d'authentification. Ils ne s'arrangent pas en insistant, et insister sur un
 * refus d'authentification est le meilleur moyen de faire bloquer le compte.
 */
function pannePassagere(message: string): boolean {
  if (/invalid|no recipients|550|553|authentication|auth failed|EAUTH/i.test(message)) return false;
  return /timeout|timed out|socket close|socket hang up|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ESOCKET|Greeting never received|Connection closed|\b421\b|\b45\d\b/i
    .test(message);
}

/**
 * Envoie un email. Ne lève JAMAIS d'exception : renvoie { ok, erreur? } pour que
 * l'appelant décide (la vente/le document restent valides même si l'email échoue).
 */
/**
 * Transporteur de SECOURS, sur l'autre port.
 *
 * IONOS écoute en 465 (TLS d'emblée) et en 587 (STARTTLS). Les échecs observés
 * le sont tous sur le port configuré ; rien n'indique que le serveur soit en
 * panne, plutôt qu'une de ses façades soit saturée. Réessayer sur le MÊME port
 * reproduit souvent le même échec — passer sur l'autre est ce qui distingue une
 * reprise utile d'une reprise cosmétique.
 */
function transportSecours(): Transporter {
  const alternatif = SMTP_PORT === 465 ? { port: 587, secure: false } : { port: 465, secure: true };
  return nodemailer.createTransport({
    host: SMTP_HOST,
    ...alternatif,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
  });
}

/**
 * Exécute l'envoi et, si la connexion a lâché, le retente sur l'AUTRE port.
 *
 * Le transporteur principal est jeté au passage : le reprendre réutiliserait la
 * configuration qui vient d'échouer. On ne tente qu'une seule fois — au-delà,
 * on n'a plus affaire à un incident mais à une panne, et il vaut mieux la voir
 * dans le journal que la masquer sous des réessais.
 */
async function avecSecondEssai<T>(envoi: (t: Transporter) => Promise<T>): Promise<T> {
  try {
    return await envoi(transport());
  } catch (err: any) {
    const message = String(err?.message ?? "");
    if (!pannePassagere(message)) throw err;
    _transport = null;
    await new Promise((r) => setTimeout(r, 900));
    return await envoi(transportSecours());
  }
}

export async function envoyerEmail(e: EnvoiEmail): Promise<{ ok: boolean; erreur?: string }> {
  if (!EMAIL_ACTIF) {
    const erreur = "Envoi désactivé : identifiants SMTP (SMTP_USER / SMTP_PASS) absents des variables d'environnement Vercel.";
    await journaliser("email_non_envoye_drapeau_inactif", e, { erreur });
    return { ok: false, erreur };
  }

  // Adresse inexploitable : on le dit clairement plutôt que de laisser nodemailer
  // répondre « No recipients defined », qui ne désigne pas le coupable.
  const cibles = String(e.a ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!cibles.length || !cibles.every(adresseValide)) {
    const erreur = `Adresse destinataire invalide : « ${String(e.a ?? "")} »`;
    await journaliser("email_adresse_invalide", e, { erreur });
    return { ok: false, erreur };
  }

  try {
    const info = await avecSecondEssai((t) => t.sendMail({
      from: EXPEDITEUR,
      to: e.a,
      ...(e.copieCachee ? { bcc: e.copieCachee } : {}),
      replyTo: REPONDRE_A,
      subject: e.objet,
      html: e.html,
      attachments: (e.piecesJointes ?? []).map((p) => ({
        filename: p.nom,
        content: p.contenu,
        contentType: "application/pdf",
      })),
    }));

    await journaliser("email_envoye", e, {
      message_id: info.messageId ?? null,
      reponse_smtp: (info as any).response ?? null,
      acceptes: (info as any).accepted ?? null,
      rejetes: (info as any).rejected ?? null,
      enveloppe: (info as any).envelope ?? null,
      pieces_jointes: (e.piecesJointes ?? []).map((p) => p.nom),
      copie_cachee: e.copieCachee ?? null,
    });
    return { ok: true };
  } catch (err: any) {
    const erreur = err?.message || "Erreur SMTP lors de l'envoi.";
    await journaliser("email_echec", e, { erreur });
    const enFile = await mettreEnFile(e, erreur);
    await consignerIncident("email", `Échec d'envoi : ${e.objet}`, erreur, { a: e.a, mis_en_file: enFile });
    return { ok: false, erreur };
  }
}

/** Taille maximale des pièces jointes conservées en file (base64). Au-delà, on ne
 *  met pas en file : stocker plusieurs mégaoctets par message ferait de la table
 *  une décharge, et un renvoi tronqué serait pire qu'un échec signalé. */
const MAX_PJ_B64 = 4_000_000;

/**
 * Conserve un envoi raté pour le rejouer plus tard.
 *
 * 28/09/2026 — les deux tentatives directes (ports 465 et 587) échouaient parfois
 * toutes les deux : 16 messages perdus en septembre, dont 8 accusés de réception
 * de test de positionnement. Ils n'étaient rejoués par personne.
 *
 * On ne met en file QUE les pannes passagères. Une adresse invalide ou un refus
 * d'authentification n'a rien à y faire : réessayer n'y changerait rien, et
 * insister sur un refus d'authentification fait bloquer le compte.
 *
 * Ne lève jamais : un échec de mise en file ne doit pas masquer l'échec d'envoi
 * qu'il accompagne.
 */
async function mettreEnFile(e: EnvoiEmail, erreur: string): Promise<boolean> {
  if (!pannePassagere(erreur)) return false;
  try {
    let pieces: { nom: string; contenu_b64: string }[] | null = null;
    if (e.piecesJointes?.length) {
      const encodees = e.piecesJointes.map((p) => ({ nom: p.nom, contenu_b64: p.contenu.toString("base64") }));
      const poids = encodees.reduce((n, p) => n + p.contenu_b64.length, 0);
      if (poids > MAX_PJ_B64) {
        await journaliser("email_file_refusee", e, { erreur, motif: `pièces jointes trop lourdes (${Math.round(poids / 1000)} ko)` });
        return false;
      }
      pieces = encodees;
    }
    const { error } = await supabaseAdmin.from("emails_en_attente").insert({
      destinataire: e.a,
      copie_cachee: e.copieCachee ?? null,
      objet: e.objet,
      html: e.html,
      pieces_jointes: pieces,
      entite: e.entite ?? null,
      entite_id: e.entiteId ?? null,
      auteur: e.auteur ?? null,
      derniere_erreur: erreur,
    });
    if (error) return false;
    await journaliser("email_mis_en_file", e, { erreur });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renvoi d'un message déjà en file. N'appelle PAS mettreEnFile : c'est la reprise
 * qui gère le compteur d'essais et l'écart croissant, sinon un même message
 * s'empilerait autant de fois qu'il échoue.
 */
export async function reenvoyerDepuisFile(m: {
  destinataire: string; copie_cachee: string | null; objet: string; html: string;
  pieces_jointes: { nom: string; contenu_b64: string }[] | null;
}): Promise<{ ok: boolean; erreur?: string }> {
  if (!EMAIL_ACTIF) return { ok: false, erreur: "Envoi désactivé (identifiants SMTP absents)." };
  try {
    await avecSecondEssai((t) => t.sendMail({
      from: EXPEDITEUR,
      to: m.destinataire,
      ...(m.copie_cachee ? { bcc: m.copie_cachee } : {}),
      replyTo: REPONDRE_A,
      subject: m.objet,
      html: m.html,
      attachments: (m.pieces_jointes ?? []).map((p) => ({
        filename: p.nom,
        content: Buffer.from(p.contenu_b64, "base64"),
        contentType: "application/pdf",
      })),
    }));
    return { ok: true };
  } catch (err: any) {
    return { ok: false, erreur: err?.message || "Erreur SMTP lors du renvoi." };
  }
}

/**
 * Gabarit HTML maison : bandeau bleu MYSTORY + pied légal (3 sites, jamais Paris).
 *
 * ⚠️ `corpsHtml` est inséré TEL QUEL. Toute valeur qui n'est pas une constante littérale
 * — a fortiori ce qui vient d'un formulaire public ou de la base — doit passer par
 * `ech()` de `lib/html.ts` AVANT d'arriver ici, et un objet de message par `enTete()`.
 * Un nom de candidat contenant `<b>` casse la mise en forme ; `<img src=x onerror=…>`
 * fait entrer du balisage actif dans une boîte que le secrétariat ouvre tous les jours.
 *
 * 09/10/2026 — les gabarits de `app/api/commande` et `lib/commandePaiement.ts` le font.
 * Les autres appelants (une quarantaine) n'ont PAS encore été repris : c'est un chantier
 * à part, à mener sur sa propre branche, pas en marge d'une route de paiement.
 *
 * ✅ `titre`, EN REVANCHE, EST ÉCHAPPÉ ICI, pour tous les appelants d'un coup.
 *
 * Trois fois de suite, une revue a trouvé une donnée d'origine externe arrivant dans
 * un e-mail par son titre — à chaque fois à un endroit différent. Le correctif
 * ponctuel ne tient pas : un gabarit qui n'échappe pas ce qu'on lui donne est un
 * piège permanent, qu'il suffit d'oublier une fois. Un gabarit qui échappe toujours
 * ne peut plus être mal utilisé.
 *
 * Aucun appelant n'a besoin de HTML dans son titre : c'est une ligne de sous-titre
 * dans un bandeau. Si le besoin apparaissait, il passerait par un paramètre explicite
 * — et non par le retrait de cet échappement.
 */
export function gabaritEmail(titre: string, corpsHtml: string): string {
  const i = identiteLegale();
  const titreSur = ech(titre);
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2430;">
<div style="max-width:560px;margin:0 auto;padding:20px 14px;">
  <div style="background:#2F72DE;color:#ffffff;border-radius:12px;padding:18px 20px;">
    <div style="font-size:18px;font-weight:bold;">MYSTORY Formation</div>
    <div style="font-size:13px;opacity:.92;">${titreSur}</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e6e9f0;border-radius:12px;padding:18px 20px;margin-top:12px;font-size:14px;line-height:1.6;">
    ${corpsHtml}
  </div>
  <div style="color:#9aa1ad;font-size:11px;text-align:center;margin-top:16px;line-height:1.5;">
    ${i.raison} · SIRET ${i.siret} · Déclaration d'activité n° ${i.nda} (ne vaut pas agrément de l'État)<br>
    Gagny : 3 bis av. de Gagny, 93220 · Sarcelles : 18 av. du 8 Mai 1945, 95200 · Rosny : 46 bis rue d'Estienne d'Orves, 93110<br>
    ${i.telephone} · ${i.email} · ${i.siteWeb}<br>
    <span style="display:inline-block;margin-top:8px;color:#aab0bb;">Vos données sont traitées par MYSTORY (responsable de traitement) pour la gestion de votre formation, conservées 5 ans et jamais cédées. Vous disposez d'un droit d'accès, de rectification et d'effacement&nbsp;: ${i.email}. Politique de confidentialité&nbsp;: <a href="https://www.mystoryformation.fr/politique-de-confidentialite" style="color:#aab0bb;">mystoryformation.fr/politique-de-confidentialite</a>. Médiateur de la consommation&nbsp;: ${i.mediateur}.</span>
  </div>
</div>
</body></html>`;
}
