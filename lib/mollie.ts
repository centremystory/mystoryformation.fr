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

/** Une ligne de commande transmise à Mollie. `prix` est le total de la ligne, en euros. */
export type LignePaiement = { libelle: string; prix: number; quantite?: number };

/** L'adresse de facturation, telle que nos formulaires la collectent déjà. */
export type AdresseFacturation = {
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  pays?: string | null;
};

/**
 * Les pays que nos formulaires produisent, vers le code ISO 3166-1 alpha-2 exigé par Mollie.
 *
 * Nos formulaires demandent « Pays » en texte libre, pré-rempli « France ». Mollie veut
 * « FR ». Envoyer « France » fait rejeter l'adresse — donc disparaître Klarna, sans message
 * utile. On ne devine pas : un pays qu'on ne sait pas traduire fait ABANDONNER l'adresse
 * (le paiement part comme avant, Klarna ne s'affiche pas) plutôt qu'échouer le paiement.
 */
const PAYS_ISO: Record<string, string> = {
  france: "FR", belgique: "BE", suisse: "CH", luxembourg: "LU", allemagne: "DE",
  espagne: "ES", italie: "IT", portugal: "PT", "pays-bas": "NL", autriche: "AT",
  irlande: "IE", maroc: "MA", algérie: "DZ", algerie: "DZ", tunisie: "TN",
};

function codePays(brut: string | null | undefined): string | null {
  const v = String(brut ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return PAYS_ISO[v.toLowerCase()] ?? null;
}

const euro = (n: number) => ({ currency: "EUR", value: n.toFixed(2) });

/**
 * Crée un paiement et renvoie l'adresse de la page de règlement.
 *
 * `reference` est notre identifiant de pré-inscription (ou de commande) : il revient tel
 * quel dans le webhook et dans l'export Mollie. C'est lui qui fait le lien entre l'argent
 * reçu et le candidat — ne jamais le retirer des métadonnées.
 *
 * ── POURQUOI `lignes` ET `adresse` SONT LÀ : POUR KLARNA ────────────────────────
 * 09/10/2026. Une vraie page de paiement n'offrait que « Cartes de crédit » et « iDEAL »,
 * alors que **Klarna est activé** sur le compte Mollie (profil MYSTORY, mode LIVE, 5 moyens
 * actifs dont Klarna sur 19 pays). La cause n'était pas chez Mollie, elle était ici : nous
 * envoyions un paiement minimal. Mollie n'affiche Klarna que si le paiement porte
 * **`lines`** (le détail de la commande) et **`billingAddress`** (identité + adresse
 * postale + e-mail). Sans ces deux champs, Klarna est simplement masqué — aucun message
 * d'erreur, aucune trace : on croit que le moyen est désactivé.
 *
 * 🔴 Ces deux champs ne servent à RIEN pour nous. Ils ne servent qu'à faire apparaître
 * Klarna. Les retirer comme « inutiles » ferait disparaître le paiement fractionné sans
 * qu'aucun test ne tombe, et sans qu'on comprenne pourquoi avant des semaines. Ne pas les
 * retirer.
 *
 * Les deux paramètres sont OPTIONNELS, volontairement : les appelants qui ne les passent
 * pas obtiennent exactement le paiement d'avant. Rien ne casse ; Klarna ne s'affiche pas.
 *
 * La France est supportée, le minimum Klarna est de 1 € : rien d'autre ne bloque.
 */
export async function creerPaiement(args: {
  montant: number;
  description: string;
  reference: string;
  email?: string;
  urlRetour: string;
  urlWebhook: string;
  lignes?: LignePaiement[];
  adresse?: AdresseFacturation;
}): Promise<PaiementCree> {
  const corps: Record<string, unknown> = {
    amount: euro(args.montant),
    // 200 caractères max chez Mollie, et c'est ce que le candidat lit sur son relevé.
    description: args.description.slice(0, 200),
    redirectUrl: args.urlRetour,
    webhookUrl: args.urlWebhook,
    locale: "fr_FR",
    metadata: { reference: args.reference, email: args.email ?? null },
  };

  /* ⚠️ LE PIÈGE CLASSIQUE : chez Mollie, la somme des `lines` doit être EXACTEMENT égale
     au montant total, au centime. Un écart d'un centime fait rejeter le paiement ENTIER,
     pas seulement la ligne fautive. On vérifie donc avant d'envoyer, et en cas d'écart on
     envoie le paiement SANS les lignes : mieux vaut un paiement sans Klarna qu'un candidat
     devant une erreur Mollie. */
  if (args.lignes?.length) {
    const somme = args.lignes.reduce((n, l) => n + l.prix, 0);
    if (Math.abs(somme - args.montant) < 0.005) {
      corps.lines = args.lignes.map((l) => {
        const q = l.quantite && l.quantite > 0 ? l.quantite : 1;
        return {
          description: l.libelle.slice(0, 200),
          quantity: q,
          unitPrice: euro(l.prix / q),
          totalAmount: euro(l.prix),
          // Pas de `vatRate` : l'assujettissement de nos prestations n'est pas tranché ici,
          // et ces champs sont optionnels. Annoncer un taux faux à Mollie serait pire que
          // de n'en annoncer aucun.
        };
      });
    }
  }

  // L'adresse n'est envoyée que si elle est COMPLÈTE : Mollie rejette une adresse
  // partielle, et une adresse rejetée fait échouer le paiement, pas seulement Klarna.
  if (args.adresse) {
    const a = args.adresse;
    const pays = codePays(a.pays);
    const rue = String(a.adresse ?? "").trim();
    const cp = String(a.codePostal ?? "").trim();
    const ville = String(a.ville ?? "").trim();
    const prenom = String(a.prenom ?? "").trim();
    const nom = String(a.nom ?? "").trim();
    const mail = String(a.email ?? args.email ?? "").trim();
    if (pays && rue && cp && ville && prenom && nom && mail) {
      corps.billingAddress = {
        givenName: prenom, familyName: nom, email: mail,
        streetAndNumber: rue, postalCode: cp, city: ville, country: pays,
      };
    }
  }

  const j = await mollie("/payments", { method: "POST", body: JSON.stringify(corps) });
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

/**
 * Le MOYEN réellement employé par le candidat : `creditcard`, `klarna`, `ideal`…
 *
 * 09/10/2026. Ajouté pour l'onglet de suivi des paiements du site : Arudhan veut
 * distinguer une carte d'un Klarna, et cette information n'existe NULLE PART chez nous.
 * Le webhook (`/api/paiements/mollie`) n'enregistre que `reference_paiement` et
 * `paye_le` ; le moyen n'est connu que de Mollie.
 *
 * 🔴 POURQUOI UNE LECTURE À LA DEMANDE, ET PAS UNE COLONNE EN BASE. Persister le moyen
 * demanderait de toucher le webhook — c'est-à-dire le chemin de l'argent : une colonne
 * manquante au moment du déploiement y ferait échouer l'`update`, et une inscription
 * payée ne serait jamais validée. Un confort de reporting ne vaut pas ce risque. On
 * relit donc Mollie au moment d'afficher, et jamais au moment d'encaisser.
 *
 * ⚠️ Rend `null` sur le moindre refus (clé absente, paiement inconnu, Mollie indisponible)
 * et NE LÈVE JAMAIS : l'appelant doit pouvoir se replier sur un libellé générique. Un
 * suivi de paiements qui tombe parce que Mollie tousse ne sert à rien.
 */
export async function lireMoyen(id: string): Promise<string | null> {
  if (!process.env.MOLLIE_API_KEY?.trim()) return null;
  try {
    const j = await mollie(`/payments/${encodeURIComponent(id)}`);
    const m = j?.method;
    return m ? String(m) : null;
  } catch {
    return null;
  }
}
