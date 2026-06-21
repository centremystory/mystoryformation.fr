/**
 * MYSTORY — Client DocuSeal  (Brique 2D — variante HTML)
 * ------------------------------------------------------
 * Envoi de la Convention en signature + vérification du webhook de retour.
 *
 * PIVOT HTML : on n'envoie plus un PDF que l'on a rendu nous-mêmes (plus de Chromium).
 * On envoie le HTML de la convention à DocuSeal via `POST {base}/submissions/html` :
 * DocuSeal génère le PDF À PARTIR du HTML *et* prépare la demande de signature en un seul appel.
 *
 * Option A (retenue) : l'organisme PRÉ-SIGNE la convention — la signature + le cachet du Président
 * sont GRAVÉS dans le HTML (images). DocuSeal ne collecte donc QUE la signature du STAGIAIRE.
 *   -> 1 seul signataire. SIGNERS_COUNT = 1.
 *
 * Les champs signables sont posés dans le HTML sous forme de balises HTML DocuSeal
 * (<signature-field>, <date-field>), avec role="Stagiaire". Ces balises ne sont PAS des {{...}}
 * et traversent donc le moteur de fusion sans être touchées.
 *
 * Sécurité câblée ici :
 *  - Vérification d'authenticité du webhook AVANT tout traitement (sinon ignoré).
 *    Supporte les deux mécanismes DocuSeal : signature HMAC-SHA256 (en-tête
 *    X-Docuseal-Signature, format `timestamp.signature`) OU secret statique en en-tête.
 *  - L'appelant gère l'idempotence (clé = submissionId + eventType).
 *
 * Variables d'environnement attendues :
 *  - DOCUSEAL_BASE_URL        BASE D'API, pas l'URL de connexion :
 *                               . cloud        -> https://api.docuseal.com  (ou .eu)
 *                               . auto-hébergé -> https://ton-domaine/api
 *  - DOCUSEAL_API_KEY         clé API (en-tête X-Auth-Token)
 *  - DOCUSEAL_WEBHOOK_SECRET  whsec_... (HMAC) — recommandé
 *  - DOCUSEAL_WEBHOOK_HEADER  / DOCUSEAL_WEBHOOK_HEADER_VALUE — fallback secret statique
 */

import crypto from "crypto";

const BASE_URL = (process.env.DOCUSEAL_BASE_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.DOCUSEAL_API_KEY ?? "";

/** Hôte public DocuSeal (sans /api) — pour construire le lien de signature intégré. */
const APP_URL = BASE_URL.replace(/\/api\/?$/, "");

/** Option A : seul le stagiaire signe dans DocuSeal (l'OF est pré-signé dans le HTML). */
export const SIGNERS_COUNT = 1;

const STAGIAIRE_ROLE = "Stagiaire";

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
  slug?: string;    // slug du signataire (stagiaire) -> lien de signature intégré
  signUrl?: string; // URL de signature sur place (.../s/<slug> ou embed_src)
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
// 1. Envoi de la Convention en signature (à partir du HTML)
// ---------------------------------------------------------------------------

/**
 * Crée une submission DocuSeal directement à partir du HTML fusionné de la Convention.
 * DocuSeal rend le PDF (lieu = Gagny, déjà forcé par le moteur de fusion) et ouvre la
 * signature pour le stagiaire.
 *
 * UN seul signataire :
 *   - Stagiaire (rôle « Stagiaire ») -> reçoit l'email DocuSeal et signe.
 * Le positionnement de sa signature vient des balises <signature-field role="Stagiaire">
 * présentes dans le HTML. La signature + le cachet de l'OF sont des images gravées dans le HTML.
 *
 * @param html       HTML complet de la convention, déjà fusionné (avec les <signature-field>).
 * @param dossierId  posé en external_id du stagiaire -> permet de retrouver le dossier au webhook.
 */
export async function createConventionSubmissionFromHtml(params: {
  html: string;
  stagiaire: ConventionSignataire;
  dossierId: string;
  sendEmail?: boolean;
}): Promise<CreateSubmissionResult> {
  assertConfigured();

  const { html, stagiaire, dossierId, sendEmail = true } = params;

  const body = {
    name: `Convention de formation — ${stagiaire.prenom} ${stagiaire.nom}`,
    send_email: sendEmail,
    documents: [
      {
        name: "Convention de formation",
        html,
        size: "A4",
      },
    ],
    submitters: [
      {
        role: STAGIAIRE_ROLE,
        email: stagiaire.email,
        name: `${stagiaire.prenom} ${stagiaire.nom}`,
        external_id: dossierId, // <- clé de rattachement au dossier CRM
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/submissions/html`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`DocuSeal createConventionSubmissionFromHtml ${res.status}: ${detail}`);
  }

  const json = (await res.json()) as unknown;
  const { submissionId, submitterIds, slug, embedSrc } = extractSubmission(json);
  if (!submissionId) {
    throw new Error("DocuSeal: submission_id absent de la réponse");
  }

  // Lien de signature « sur place » : embed_src si fourni, sinon construit depuis le slug.
  const signUrl = embedSrc ?? (slug ? `${APP_URL}/s/${slug}` : undefined);

  return { submissionId, submitterIds, slug, signUrl, raw: json };
}

export const SIGNATAIRE_ROLE = "Signataire";

/**
 * Engagement de confidentialité : UN signataire (le membre de l'équipe).
 * Le HTML porte une balise <signature-field role="Signataire">. external_id = "confid:<id>".
 */
export async function createConfidentialiteSubmission(params: {
  html: string;
  signataire: { email: string; nom: string; prenom?: string };
  externalId: string; // "confid:<uuid>"
  documentName: string;
  sendEmail?: boolean;
}): Promise<CreateSubmissionResult> {
  assertConfigured();
  const { html, signataire, externalId, documentName, sendEmail = true } = params;
  const body = {
    name: documentName,
    send_email: sendEmail,
    documents: [{ name: documentName, html, size: "A4" }],
    submitters: [
      { role: SIGNATAIRE_ROLE, email: signataire.email, name: `${signataire.prenom ?? ""} ${signataire.nom}`.trim(), external_id: externalId },
    ],
  };
  const res = await fetch(`${BASE_URL}/submissions/html`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const detail = await safeText(res); throw new Error(`DocuSeal createConfidentialiteSubmission ${res.status}: ${detail}`); }
  const json = (await res.json()) as unknown;
  const { submissionId, submitterIds, slug, embedSrc } = extractSubmission(json);
  if (!submissionId) throw new Error("DocuSeal: submission_id absent de la réponse");
  const signUrl = embedSrc ?? (slug ? `${APP_URL}/s/${slug}` : undefined);
  return { submissionId, submitterIds, slug, signUrl, raw: json };
}

export const CENTRE_ROLE = "Centre";

/**
 * Fiche d'analyse du besoin : DEUX signataires (Stagiaire + Centre).
 * Les positions viennent des balises <signature-field role="Stagiaire"|"Centre"> injectées dans le HTML.
 * external_id = "fiche_besoin:<dossierId>" sur les deux submitters -> rattachement au dossier au webhook.
 */
export async function createFicheBesoinSubmissionFromHtml(params: {
  html: string;
  stagiaire: ConventionSignataire;
  centreEmail: string;
  centreNom?: string;
  dossierId: string;
  sendEmail?: boolean;
}): Promise<CreateSubmissionResult> {
  assertConfigured();
  const { html, stagiaire, centreEmail, centreNom = "MYSTORY Formation", dossierId, sendEmail = true } = params;
  const ext = `fiche_besoin:${dossierId}`;
  const body = {
    name: `Fiche d'analyse du besoin — ${stagiaire.prenom} ${stagiaire.nom}`,
    send_email: sendEmail,
    documents: [{ name: "Fiche d'analyse du besoin", html, size: "A4" }],
    submitters: [
      { role: STAGIAIRE_ROLE, email: stagiaire.email, name: `${stagiaire.prenom} ${stagiaire.nom}`, external_id: ext },
      { role: CENTRE_ROLE, email: centreEmail, name: centreNom, external_id: ext },
    ],
  };
  const res = await fetch(`${BASE_URL}/submissions/html`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const detail = await safeText(res); throw new Error(`DocuSeal createFicheBesoinSubmissionFromHtml ${res.status}: ${detail}`); }
  const json = (await res.json()) as unknown;
  const { submissionId, submitterIds, slug, embedSrc } = extractSubmission(json);
  if (!submissionId) throw new Error("DocuSeal: submission_id absent de la réponse");
  const signUrl = embedSrc ?? (slug ? `${APP_URL}/s/${slug}` : undefined);
  return { submissionId, submitterIds, slug, signUrl, raw: json };
}

/**
 * La réponse de création peut être un tableau de submitters (forme habituelle des
 * endpoints /submissions*) ou un objet submission. On gère les deux défensivement.
 */
function extractSubmission(json: unknown): {
  submissionId?: number; submitterIds: number[]; slug?: string; embedSrc?: string;
} {
  if (Array.isArray(json)) {
    const arr = json as Array<{ id?: number; submission_id?: number; slug?: string; embed_src?: string }>;
    return {
      submissionId: arr[0]?.submission_id ?? undefined,
      submitterIds: arr.map((s) => s.id).filter((n): n is number => typeof n === "number"),
      slug: arr[0]?.slug,
      embedSrc: arr[0]?.embed_src,
    };
  }
  const obj = (json ?? {}) as {
    id?: number;
    submission_id?: number;
    submitters?: Array<{ id?: number; slug?: string; embed_src?: string }>;
  };
  const submissionId = obj.submission_id ?? obj.id ?? undefined;
  const first = obj.submitters?.[0];
  const submitterIds = (obj.submitters ?? [])
    .map((s) => s.id)
    .filter((n): n is number => typeof n === "number");
  return { submissionId, submitterIds, slug: first?.slug, embedSrc: first?.embed_src };
}

// ---------------------------------------------------------------------------
// 2. Récupération du/des PDF (généré ou signé)
// ---------------------------------------------------------------------------

/** Télécharge un document depuis l'URL fournie par DocuSeal (URL temporaire). */
export async function downloadSignedDocument(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DocuSeal downloadSignedDocument ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Documents d'une submission. Avant signature -> PDF rendu par DocuSeal (= « généré »).
 * Après complétion -> PDF signé. Sert de filet de sécurité si le webhook ne porte pas les URLs.
 */
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
// 2bis. Rendu pur HTML -> PDF (documents NON signés : convocation, attestation, ...)
// ---------------------------------------------------------------------------

/**
 * Utilise DocuSeal comme simple moteur de rendu HTML -> PDF, SANS signature.
 * On crée une submission à partir du HTML (qui ne contient AUCUNE balise de champ),
 * sans envoi d'email, puis on récupère le PDF rendu. Aucun signataire à solliciter.
 *
 * @returns le PDF (Buffer) + l'id de submission DocuSeal (traçabilité).
 */
export async function renderHtmlToPdf(params: {
  html: string;
  name: string;
}): Promise<{ pdf: Buffer; submissionId: number }> {
  assertConfigured();
  const { html, name } = params;

  const body = {
    name,
    send_email: false, // aucun email : ce n'est pas une demande de signature
    documents: [{ name, html, size: "A4" }],
    submitters: [
      { role: "Organisme", email: process.env.DOCUSEAL_OF_EMAIL ?? "contact@mystoryformation.fr" },
    ],
  };

  const res = await fetch(`${BASE_URL}/submissions/html`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`DocuSeal renderHtmlToPdf ${res.status}: ${await safeText(res)}`);
  }
  const { submissionId } = extractSubmission((await res.json()) as unknown);
  if (!submissionId) throw new Error("DocuSeal renderHtmlToPdf : submission_id absent");

  // Le rendu peut être très légèrement asynchrone : on retente quelques fois.
  let docs: Array<{ name?: string; url: string }> = [];
  for (let i = 0; i < 4; i++) {
    docs = await getSubmissionDocuments(submissionId);
    if (docs[0]?.url) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!docs[0]?.url) throw new Error("DocuSeal renderHtmlToPdf : PDF rendu introuvable");

  const pdf = await downloadSignedDocument(docs[0].url);
  return { pdf, submissionId };
}

// ---------------------------------------------------------------------------
// 3. Vérification d'authenticité du webhook
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'un webhook provient bien de DocuSeal.
 * À appeler AVANT de parser/traiter. Renvoie false -> on ignore (401).
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

  // (b) Fallback : secret statique en en-tête (onglet Security -> Secret de DocuSeal).
  const headerName = process.env.DOCUSEAL_WEBHOOK_HEADER;
  const headerValue = process.env.DOCUSEAL_WEBHOOK_HEADER_VALUE;
  if (headerName && headerValue) {
    const received = headers.get(headerName.toLowerCase()) ?? "";
    return timingSafeEqualStr(received, headerValue);
  }

  // Aucun secret configuré -> on REFUSE (un webhook non vérifié = pièce conforme falsifiable).
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


// ---------------------------------------------------------------------------
// 4. Onboarding formateur : envoi d'un document signable (charte / contrat)
// ---------------------------------------------------------------------------

/**
 * Crée une submission DocuSeal à partir du HTML d'un document formateur (charte ou contrat
 * de sous-traitance). Un seul signataire : le FORMATEUR (rôle « Formateur »). L'organisme est
 * pré-signé dans le HTML (mention/texte). external_id encode le rattachement : « formateur:<id>:<type> ».
 */
export async function createFormateurSubmissionFromHtml(params: {
  html: string;
  formateur: { email: string; nom: string; prenom?: string };
  externalId: string; // ex. "formateur:<uuid>:charte"
  documentName: string;
  sendEmail?: boolean;
}): Promise<CreateSubmissionResult> {
  assertConfigured();
  const { html, formateur, externalId, documentName, sendEmail = true } = params;

  const body = {
    name: documentName,
    send_email: sendEmail,
    documents: [{ name: documentName, html, size: "A4" }],
    submitters: [
      {
        role: "Formateur",
        email: formateur.email,
        name: `${formateur.prenom ?? ""} ${formateur.nom}`.trim(),
        external_id: externalId,
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/submissions/html`, {
    method: "POST",
    headers: { "X-Auth-Token": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DocuSeal createFormateurSubmissionFromHtml ${res.status}: ${await safeText(res)}`);

  const json = (await res.json()) as unknown;
  const { submissionId, submitterIds, slug, embedSrc } = extractSubmission(json);
  if (!submissionId) throw new Error("DocuSeal: submission_id absent de la réponse");
  const signUrl = embedSrc ?? (slug ? `${APP_URL}/s/${slug}` : undefined);
  return { submissionId, submitterIds, slug, signUrl, raw: json };
}
