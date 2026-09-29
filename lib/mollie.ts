/**
 * MYSTORY — Mollie : création et relecture d'un paiement.
 *
 * 29/09/2026. Choisi contre les liens Qonto pour deux raisons. Qonto exige une
 * application OAuth2 pour créer un lien de paiement — une clé API, même valide, se voit
 * répondre « OAuth2 authentication is required here ». Et surtout, un lien Qonto générique
 * ne sait pas QUI paie : Mollie renvoie un identifiant de paiement et nos propres métadonnées,
 * ce qui rattache l'encaissement au candidat sans rapprochement manuel.
 *
 * L'argent arrive au même endroit : les versements Mollie sont déjà visibles sur le compte
 * Qonto, agrégés par lot (voir le contrôle hebdomadaire ventes ↔ banque).
 *
 * Une seule variable d'environnement : MOLLIE_API_KEY. Une clé `test_…` fait tourner toute
 * la chaîne sans mouvement d'argent ; une clé `live_…` encaisse réellement.
 */

const BASE = "https://api.mollie.com/v2";

export function molliePret(): boolean {
  return !!process.env.MOLLIE_API_KEY?.trim();
}

/** Une clé de test ne doit jamais encaisser pour de vrai — utile à afficher en clair. */
export function mollieEnTest(): boolean {
  return (process.env.MOLLIE_API_KEY ?? "").trim().startsWith("test_");
}

async function mollie(chemin: string, init?: RequestInit): Promise<any | null> {
  const cle = process.env.MOLLIE_API_KEY?.trim();
  if (!cle) return null;
  try {
    const r = await fetch(`${BASE}${chemin}`, {
      ...init,
      headers: {
        authorization: `Bearer ${cle}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      // Mollie décrit ses refus proprement : on garde le détail pour le journal.
      const detail = j?.detail || j?.title || `HTTP ${r.status}`;
      throw new Error(String(detail));
    }
    return j;
  } catch (e) {
    throw e instanceof Error ? e : new Error("Appel Mollie impossible.");
  }
}

export type PaiementCree = { id: string; url: string };

/**
 * Crée un paiement et renvoie l'adresse de la page de règlement.
 *
 * `reference` est notre identifiant de pré-inscription : il revient tel quel dans le webhook
 * et dans l'export Mollie. C'est lui qui fait le lien entre l'argent reçu et le candidat —
 * ne jamais le retirer des métadonnées.
 */
export async function creerPaiement(args: {
  montant: number;
  description: string;
  reference: string;
  email?: string;
  urlRetour: string;
  urlWebhook: string;
}): Promise<PaiementCree> {
  const j = await mollie("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: args.montant.toFixed(2) },
      // 200 caractères max chez Mollie, et c'est ce que le candidat lit sur son relevé.
      description: args.description.slice(0, 200),
      redirectUrl: args.urlRetour,
      webhookUrl: args.urlWebhook,
      locale: "fr_FR",
      metadata: { reference: args.reference, email: args.email ?? null },
    }),
  });
  const url = j?._links?.checkout?.href;
  if (!j?.id || typeof url !== "string") {
    throw new Error("Mollie n'a pas renvoyé de page de paiement.");
  }
  return { id: String(j.id), url };
}

export type EtatPaiement = {
  id: string;
  statut: string;
  paye: boolean;
  montant: number | null;
  reference: string | null;
};

/**
 * Relit un paiement chez Mollie.
 *
 * Le webhook ne transmet QUE l'identifiant, jamais le statut : c'est volontaire côté Mollie,
 * et c'est ce qui empêche un tiers de nous faire croire à un paiement en appelant notre URL.
 * On redemande donc toujours l'état à la source.
 */
export async function lirePaiement(id: string): Promise<EtatPaiement> {
  const j = await mollie(`/payments/${encodeURIComponent(id)}`);
  const montant = Number(j?.amount?.value);
  return {
    id: String(j?.id ?? id),
    statut: String(j?.status ?? "inconnu"),
    paye: j?.status === "paid",
    montant: isFinite(montant) ? montant : null,
    reference: j?.metadata?.reference ? String(j.metadata.reference) : null,
  };
}
