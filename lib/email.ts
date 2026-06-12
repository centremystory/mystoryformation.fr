/**
 * MYSTORY — lib/email.ts  (envoi d'emails sortants)
 * Fournisseur : Resend (https://resend.com) · Expéditeur : contact@mystoryformation.fr
 * (adresse unique de l'organisme — toute l'équipe voit les réponses sur IONOS).
 *
 * DRAPEAU : si RESEND_API_KEY est absente des variables d'environnement Vercel,
 * l'envoi est désactivé proprement (journalisé, jamais bloquant) — règle de la
 * mission : « si une clé manque, code derrière un flag et continue ».
 *
 * Chaque tentative (envoyée, échouée ou désactivée) est tracée dans `journal`.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EXPEDITEUR = "MYSTORY Formation <contact@mystoryformation.fr>";
const REPONDRE_A = "contact@mystoryformation.fr";

export const EMAIL_ACTIF = !!process.env.RESEND_API_KEY;

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

/**
 * Envoie un email. Ne lève JAMAIS d'exception : renvoie { ok, erreur? } pour que
 * l'appelant décide (la vente/le document restent valides même si l'email échoue).
 */
export async function envoyerEmail(e: EnvoiEmail): Promise<{ ok: boolean; erreur?: string }> {
  if (!EMAIL_ACTIF) {
    const erreur = "Envoi désactivé : RESEND_API_KEY absente des variables d'environnement Vercel.";
    await journaliser("email_non_envoye_drapeau_inactif", e, { erreur });
    return { ok: false, erreur };
  }

  try {
    const corps: Record<string, unknown> = {
      from: EXPEDITEUR,
      to: [e.a],
      reply_to: REPONDRE_A,
      subject: e.objet,
      html: e.html,
    };
    if (e.piecesJointes?.length) {
      corps.attachments = e.piecesJointes.map((p) => ({
        filename: p.nom,
        content: p.contenu.toString("base64"),
      }));
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corps),
    });
    const j: any = await r.json().catch(() => ({}));

    if (!r.ok) {
      const erreur = j?.message || `Resend a répondu ${r.status}.`;
      await journaliser("email_echec", e, { erreur });
      return { ok: false, erreur };
    }

    await journaliser("email_envoye", e, {
      resend_id: j?.id ?? null,
      pieces_jointes: (e.piecesJointes ?? []).map((p) => p.nom),
    });
    return { ok: true };
  } catch (err: any) {
    const erreur = err?.message || "Erreur réseau lors de l'envoi.";
    await journaliser("email_echec", e, { erreur });
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
    06 81 43 16 54 · contact@mystoryformation.fr · mystoryformation.fr
  </div>
</div>
</body></html>`;
}
