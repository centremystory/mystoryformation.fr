/**
 * MYSTORY — lib/email.ts  (envoi d'emails sortants via SMTP IONOS)
 * Expéditeur : contact@mystoryformation.fr (boîte IONOS de l'organisme — toute l'équipe
 * voit les réponses). IONOS gère déjà SPF/DKIM du domaine → emails bien authentifiés.
 *
 * DRAPEAU : si les identifiants SMTP (SMTP_USER / SMTP_PASS) sont absents des variables
 * d'environnement Vercel, l'envoi est désactivé proprement (journalisé, jamais bloquant).
 *
 * Variables Vercel attendues :
 *   SMTP_USER  = contact@mystoryformation.fr   (obligatoire)
 *   SMTP_PASS  = mot de passe de la boîte       (obligatoire)
 *   SMTP_HOST  = smtp.ionos.fr                  (défaut : smtp.ionos.fr)
 *   SMTP_PORT  = 465                            (défaut : 465)
 *   SMTP_SECURE= true                           (défaut : true pour 465 ; false => STARTTLS 587)
 *   SMTP_FROM  = "MYSTORY Formation <contact@mystoryformation.fr>" (défaut)
 *
 * Chaque tentative (envoyée, échouée ou désactivée) est tracée dans `journal`.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consignerIncident } from "@/lib/incidents";

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.ionos.fr";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "465");
const SMTP_SECURE = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EXPEDITEUR = process.env.SMTP_FROM ?? "MYSTORY Formation <contact@mystoryformation.fr>";
const REPONDRE_A = process.env.SMTP_REPLY_TO ?? "contact@mystoryformation.fr";

export const EMAIL_ACTIF = !!(SMTP_USER && SMTP_PASS);

export interface PieceJointe {
  nom: string;      // ex. "Convocation_TEF_DUPONT.pdf"
  contenu: Buffer;  // contenu binaire (PDF…)
}

export interface EnvoiEmail {
  a: string;
  objet: string;
  html: string;
  piecesJointes?: PieceJointe[];
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
    });
  }
  return _transport;
}

/**
 * Envoie un email. Ne lève JAMAIS d'exception : renvoie { ok, erreur? } pour que
 * l'appelant décide (la vente/le document restent valides même si l'email échoue).
 */
export async function envoyerEmail(e: EnvoiEmail): Promise<{ ok: boolean; erreur?: string }> {
  if (!EMAIL_ACTIF) {
    const erreur = "Envoi désactivé : identifiants SMTP (SMTP_USER / SMTP_PASS) absents des variables d'environnement Vercel.";
    await journaliser("email_non_envoye_drapeau_inactif", e, { erreur });
    return { ok: false, erreur };
  }

  try {
    const info = await transport().sendMail({
      from: EXPEDITEUR,
      to: e.a,
      replyTo: REPONDRE_A,
      subject: e.objet,
      html: e.html,
      attachments: (e.piecesJointes ?? []).map((p) => ({
        filename: p.nom,
        content: p.contenu,
        contentType: "application/pdf",
      })),
    });

    await journaliser("email_envoye", e, {
      message_id: info.messageId ?? null,
      reponse_smtp: (info as any).response ?? null,
      acceptes: (info as any).accepted ?? null,
      rejetes: (info as any).rejected ?? null,
      enveloppe: (info as any).envelope ?? null,
      pieces_jointes: (e.piecesJointes ?? []).map((p) => p.nom),
    });
    return { ok: true };
  } catch (err: any) {
    const erreur = err?.message || "Erreur SMTP lors de l'envoi.";
    await journaliser("email_echec", e, { erreur });
    await consignerIncident("email", `Échec d'envoi : ${e.objet}`, erreur, { a: e.a });
    return { ok: false, erreur };
  }
}

/** Gabarit HTML maison : bandeau bleu MYSTORY + pied légal (3 sites, jamais Paris). */
export function gabaritEmail(titre: string, corpsHtml: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2430;">
<div style="max-width:560px;margin:0 auto;padding:20px 14px;">
  <div style="background:#2F72DE;color:#ffffff;border-radius:12px;padding:18px 20px;">
    <div style="font-size:18px;font-weight:bold;">MYSTORY Formation</div>
    <div style="font-size:13px;opacity:.92;">${titre}</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e6e9f0;border-radius:12px;padding:18px 20px;margin-top:12px;font-size:14px;line-height:1.6;">
    ${corpsHtml}
  </div>
  <div style="color:#9aa1ad;font-size:11px;text-align:center;margin-top:16px;line-height:1.5;">
    MYSTORY — SASU · SIRET 913 423 083 00017 · Déclaration d'activité n° 11756521775 (ne vaut pas agrément de l'État)<br>
    Gagny : 3 bis av. de Gagny, 93220 · Sarcelles : 18 av. du 8 Mai 1945, 95200 · Rosny : 46 bis rue d'Estienne d'Orves, 93110<br>
    06 81 43 16 54 · contact@mystoryformation.fr · mystoryformation.fr<br>
    <span style="display:inline-block;margin-top:8px;color:#aab0bb;">Vos données sont traitées par MYSTORY (responsable de traitement) pour la gestion de votre formation, conservées 5 ans et jamais cédées. Vous disposez d'un droit d'accès, de rectification et d'effacement&nbsp;: contact@mystoryformation.fr. Médiateur de la consommation&nbsp;: CM2C (cm2c.net).</span>
  </div>
</div>
</body></html>`;
}
