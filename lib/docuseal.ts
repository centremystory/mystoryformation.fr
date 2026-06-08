/**
 * MYSTORY — Client DocuSeal  (Brique 2D)
 * --------------------------------------
 * Envoi de la Convention en signature + vérification du webhook de retour.
 *
 * Réalité terrain actée : la Convention sort DÉJÀ signée côté OF (cachet + signature
 * d'Arudhan gravés à l'émission). DocuSeal ne collecte donc QUE la signature du STAGIAIRE
 * → 1 seul signataire (SIGNERS_COUNT = 1). Mettre 2 si un jour l'OF signe aussi via DocuSeal.
 *
 * Sécurité câblée ici :
 *  - Vérification d'authenticité du webhook AVANT tout traitement (sinon ignoré).
 *    Supporte les deux mécanismes DocuSeal : signature HMAC-SHA256 (en-tête
 *    X-Docuseal-Signature, format `timestamp.signature`) OU secret statique en en-tête.
 *  - L'appelant gère l'idempotence (clé = submissionId + eventType).
 *
 * Variables d'environnement attendues :
 *  - DOCUSEAL_BASE_URL        ex. https://sign.mystoryformation.fr  (instance auto-hébergée)
 *  - DOCUSEAL_API_KEY         clé API (en-tête X-Auth-Token)
 *  - DOCUSEAL_WEBHOOK_SECRET  whsec_... (HMAC)  — recommandé
 *  - DOCUSEAL_WEBHOOK_HEADER  / DOCUSEAL_WEBHOOK_HEADER_VALUE  — fallback secret statique
 */

import crypto from "crypto";

const BASE_URL = (process.env.DOCUSEAL_BASE_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.DOCUSEAL_API_KEY ?? "";

/** Nombre de signataires DocuSeal : OF (Président) + stagiaire. */
export const SIGNERS_COUNT = 2;

/** Identité OF signataire (côté organisme). */
const OF_NOM = "Arudhan NATKUNASINGAM";
const OF_EMAIL = process.env.DOCUSEAL_OF_EMAIL ?? "contact@mystoryformation.fr";
const OF_ROLE = "Organisme/Président";
const STAGIAIRE_ROLE = "Stagiaire";

/**
 * Auto-signature OF (mode retenu) : la signature enregistrée du Président est appliquée
 * automatiquement à la création de la submission → aucun geste manuel par convention.
 *
 * DOCUSEAL_OF_SIGNATURE_URL = URL téléchargeable de l'image de signature, OU base64.
 *   ⚠️ Préférer un asset à accès contrôlé ou une URL signée/éphémère (ou du base64 depuis un
 *      secret) plutôt qu'une URL publique permanente : `readonly:true` empêche la modification
 *      du champ, mais pas la récupération de l'image si l'URL est publique.
 * DOCUSEAL_OF_AUTO_SIGN = "false" pour repasser l'OF en signature manuelle (après le stagiaire).
 */
const OF_AUTO_SIGN = (process.env.DOCUSEAL_OF_AUTO_SIGN ?? "true") !== "false";
const OF_SIGNATURE_URL = process.env.DOCUSEAL_OF_SIGNATURE_URL;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConventionSignataire {
  email: string;
  nom: string;
  prenom: string;
}

export interface CreateSubmissionResult {
  submissionId: number;
  submitterIds: number[];
  raw: unknown;
}

export interface DocusealEvent {
  /** "form.completed" (un signataire a signé) | "submission.completed" (tous ont signé) | ... */
  event_type: string;
  timestamp?: string;
  data: {
    id?: number;                 // id du submitter (form.*) ou de la submission (submission.*)
    submission_id?: number;
    external_id?: string;        // = dossierId qu'on a posé à la création
    status?: string;
    documents?: Array<{ name?: string; url: string }>;
    [k: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// 1. Envoi de la Convention en signature
// ---------------------------------------------------------------------------

/**
 * Crée une submission DocuSeal à partir du PDF de Convention déjà rendu par notre pipeline.
 *
 * DEUX signataires :
 *   - Stagiaire  (rôle « Stagiaire »)            → signe via l'email DocuSeal.
 *   - OF/Président (rôle « Organisme/Président ») → auto-signé si DOCUSEAL_OF_SIGNATURE_URL est
 *     défini (completed:true + image de signature pré-remplie), sinon signe après le stagiaire.
 *
 * Le positionnement des signatures se fait par TAGS TEXTE embarqués dans le HTML de la convention :
 *     {{Signature stagiaire;role=Stagiaire;type=signature}}
 *     {{Signature Président;role=Organisme/Président;type=signature}}
 * DocuSeal détecte ces tags dans le PDF, les remplace par des champs signables, et les retire du
 * rendu. → aucune coordonnée pixel à maintenir. Le cachet (MYSTORY_cachet.png) est une image gravée
 * dans le document, DISTINCTE du champ signature OF.
 *
 * `order: 'preserved'` → le stagiaire (1er) reçoit l'email ; l'OF (2e) ne reçoit le sien qu'après,
 * sauf s'il est déjà auto-signé.
 *
 * @param conventionPdfBase64  le PDF de Convention (lieu = Gagny) encodé base64, SANS le data: prefix
 * @param dossierId            posé en external_id → permet de retrouver le dossier au webhook
 */
export async function createConventionSubmission(params: {
  conventionPdfBase64: string;
  stagiaire: ConventionSignataire;
  dossierId: string;
  sendEmail?: boolean;
}): Promise<CreateSubmissionResult> {
  assertConfigured();

  const { conventionPdfBase64, stagiaire, dossierId, sendEmail = true } = params;

  // Signataire OF. Mode retenu : auto-signé via la signature enregistrée du Président.
  const ofSubmitter: Record<string, unknown> = {
    role: OF_ROLE,
    email: OF_EMAIL,
    name: OF_NOM,
    external_id: `${dossierId}#of`,
  };
  if (OF_AUTO_SIGN) {
    // Garde-fou : on n'envoie JAMAIS une convention si l'auto-signature OF est attendue mais
    // non configurée (sinon dossier bloqué + email de signature manuelle inattendu à l'OF).
    if (!OF_SIGNATURE_URL) {
      throw new Error(
        "DocuSeal: auto-signature OF activée mais DOCUSEAL_OF_SIGNATURE_URL manquant " +
        "(définir l'image de signature du Président, ou DOCUSEAL_OF_AUTO_SIGN=false).",
      );
    }
    ofSubmitter.completed = true; // OF marqué signé via API, aucun geste manuel
    ofSubmitter.fields = [
      { name: "Signature Président", default_value: OF_SIGNATURE_URL, readonly: true },
    ];
  }

  const body = {
    name: `Convention de formation — ${stagiaire.prenom} ${stagiaire.nom}`,
    send_email: sendEmail,
    order: "preserved", // stagiaire d'abord, OF ensuite (si non auto-signé)
    documents: [{ name: "Convention de formation", file: conventionPdfBase64 }],
    submitters: [
      {
        role: STAGIAIRE_ROLE,
        email: stagiaire.email,
        name: `${stagiaire.prenom} ${stagiaire.nom}`,
        external_id: dossierId, // ← clé de rattachement au dossier CRM (signataire principal)
      },
      ofSubmitter,
    ],
  };

  const res = await fetch(`${BASE_URL}/submissions/pdf`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`DocuSeal createConventionSubmission ${res.status}: ${detail}`);
  }

  // L'API renvoie la liste des submitters créés (un par signataire).
  const created = (await res.json()) as Array<{ id: number; submission_id: number; role?: string }>;
  const submissionId = created[0]?.submission_id;
  if (!submissionId) {
    throw new Error("DocuSeal: submission_id absent de la réponse");
  }

  return {
    submissionId,
    submitterIds: created.map((s) => s.id),
    raw: created,
  };
}

// ---------------------------------------------------------------------------
// 2. Récupération du/des PDF signé(s)
// ---------------------------------------------------------------------------

/** Télécharge un document signé depuis l'URL fournie par le webhook (URL temporaire DocuSeal). */
export async function downloadSignedDocument(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DocuSeal downloadSignedDocument ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Filet de sécurité : si le webhook n'a pas porté les documents, on va les chercher par API. */
export async function getSubmissionDocuments(
  submissionId: number,
): Promise<Array<{ name?: string; url: string }>> {
  assertConfigured();
  const res = await fetch(`${BASE_URL}/submissions/${submissionId}/documents`, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    throw new Error(`DocuSeal getSubmissionDocuments ${res.status}`);
  }
  const json = (await res.json()) as { documents?: Array<{ name?: string; url: string }> };
  return json.documents ?? [];
}

// ---------------------------------------------------------------------------
// 3. Vérification d'authenticité du webhook
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'un webhook provient bien de DocuSeal.
 * À appeler AVANT de parser/traiter. Renvoie false → on ignore (200 silencieux ou 401).
 *
 * @param rawBody  le corps BRUT (octets exacts reçus), pas un JSON re-sérialisé.
 * @param headers  les en-têtes de la requête.
 */
export function verifyWebhook(rawBody: string, headers: Headers): boolean {
  // (a) Mécanisme recommandé : signature HMAC-SHA256.
  const sigHeader = headers.get("x-docuseal-signature");
  const hmacSecret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (sigHeader && hmacSecret) {
    return verifyHmac(rawBody, sigHeader, hmacSecret);
  }

  // (b) Fallback : secret statique en en-tête (onglet Security → Secret de DocuSeal).
  const headerName = process.env.DOCUSEAL_WEBHOOK_HEADER;
  const headerValue = process.env.DOCUSEAL_WEBHOOK_HEADER_VALUE;
  if (headerName && headerValue) {
    const received = headers.get(headerName.toLowerCase()) ?? "";
    return timingSafeEqualStr(received, headerValue);
  }

  // Aucun secret configuré → on REFUSE (un webhook non vérifié = pièce conforme falsifiable).
  return false;
}

function verifyHmac(rawBody: string, sigHeader: string, secret: string): boolean {
  // Format attendu : `timestamp.signature` ; contenu signé : `timestamp.rawBody`.
  const dot = sigHeader.indexOf(".");
  if (dot < 0) return false;
  const timestamp = sigHeader.slice(0, dot);
  const signature = sigHeader.slice(dot + 1);

  // Tolérance 5 min contre le rejeu.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return timingSafeEqualStr(expected, signature);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function assertConfigured(): void {
  if (!BASE_URL || !API_KEY) {
    throw new Error("DocuSeal non configuré : DOCUSEAL_BASE_URL et DOCUSEAL_API_KEY requis.");
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(corps illisible)";
  }
}
