/**
 * MYSTORY — POST /api/webhooks/docuseal  (Brique 2D + Phase 2, branché Supabase)
 * 1) corps brut → 2) vérif HMAC → 3) idempotence (webhook_events) → 4) maj pièces + recompute.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  verifyWebhook, downloadSignedDocument, getSubmissionDocuments, SIGNERS_COUNT, type DocusealEvent,
} from "@/lib/docuseal";
import {
  isEventProcessed, markEventProcessed, findDossierBySubmission,
  setPieceStatus, archiveDocument, recomputeDossierStatus,
} from "@/lib/crm";
import { journal } from "@/lib/examens";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Vérification par jeton secret dans l'URL (?token=...).
 * Utilisée quand l'instance DocuSeal ne propose QUE le champ URL pour le webhook
 * (ni secret HMAC, ni en-tête personnalisé). Comparaison en temps constant.
 */
function verifyQueryToken(req: NextRequest): boolean {
  const attendu = process.env.DOCUSEAL_WEBHOOK_TOKEN ?? "";
  if (!attendu) return false;
  const recu = req.nextUrl.searchParams.get("token") ?? "";
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Authenticité : jeton d'URL (instance sans champ secret) OU HMAC/en-tête (verifyWebhook).
  if (!verifyQueryToken(req) && !verifyWebhook(rawBody, req.headers)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let event: DocusealEvent;
  try {
    event = JSON.parse(rawBody) as DocusealEvent;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const submissionId =
    event.data?.submission_id ??
    (event.event_type.startsWith("submission.") ? event.data?.id : undefined);
  const dossierId = event.data?.external_id;

  if (!submissionId && !dossierId) {
    return NextResponse.json({ ok: true, ignored: "pas d'identifiant exploitable" });
  }

  const eventKey = `${submissionId ?? dossierId}:${event.event_type}`;
  if (await isEventProcessed(eventKey)) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Branche onboarding formateur : external_id = "formateur:<id>:<type>" (charte | contrat).
  if (typeof dossierId === "string" && dossierId.startsWith("formateur:")) {
    if (submissionId && ["form.completed", "submission.completed"].includes(event.event_type)) {
      await finalizeFormateurSignature(dossierId, submissionId, event);
    }
    await markEventProcessed(eventKey, {
      submissionId: submissionId ?? undefined, eventType: event.event_type, dossierId: null, payload: event,
    });
    return NextResponse.json({ ok: true, scope: "formateur" });
  }

  // Branche fiche d'analyse du besoin : external_id = "fiche_besoin:<dossierId>" (2 signataires).
  if (typeof dossierId === "string" && dossierId.startsWith("fiche_besoin:")) {
    const realDossierId = dossierId.slice("fiche_besoin:".length);
    if (submissionId && event.event_type === "submission.completed") {
      await finalizeFicheBesoinSignature(realDossierId, submissionId, event);
      await recomputeDossierStatus(realDossierId);
    } else if (submissionId && event.event_type === "form.completed") {
      await setPieceStatus({ dossierId: realDossierId, piece: "fiche_analyse_besoin", status: "signature_en_cours", at: new Date().toISOString() });
    }
    await markEventProcessed(eventKey, { submissionId: submissionId ?? undefined, eventType: event.event_type, dossierId: realDossierId, payload: event });
    return NextResponse.json({ ok: true, scope: "fiche_besoin" });
  }

  // Branche engagement de confidentialité : external_id = "confid:<id>" (1 signataire).
  if (typeof dossierId === "string" && dossierId.startsWith("confid:")) {
    const confidId = dossierId.slice("confid:".length);
    if (submissionId && ["form.completed", "submission.completed"].includes(event.event_type)) {
      await finalizeConfidentialiteSignature(confidId, submissionId, event);
    }
    await markEventProcessed(eventKey, { submissionId: submissionId ?? undefined, eventType: event.event_type, dossierId: null, payload: event });
    return NextResponse.json({ ok: true, scope: "confid" });
  }

  const resolvedDossierId = dossierId ?? (await findDossierBySubmission(submissionId!));
  if (!resolvedDossierId) {
    await markEventProcessed(eventKey, {
      submissionId: submissionId ?? undefined, eventType: event.event_type, dossierId: null, payload: event,
    });
    return NextResponse.json({ ok: true, ignored: "dossier introuvable" });
  }

  switch (event.event_type) {
    case "form.completed": {
      if (SIGNERS_COUNT <= 1) {
        await finalizeSignature(resolvedDossierId, submissionId!, event);
      } else {
        await setPieceStatus({
          dossierId: resolvedDossierId, piece: "convention",
          status: "signature_en_cours", at: new Date().toISOString(),
        });
      }
      break;
    }
    case "submission.completed": {
      await finalizeSignature(resolvedDossierId, submissionId!, event);
      break;
    }
    default:
      break;
  }

  await recomputeDossierStatus(resolvedDossierId);
  await markEventProcessed(eventKey, {
    submissionId: submissionId ?? undefined, eventType: event.event_type,
    dossierId: resolvedDossierId, payload: event,
  });

  return NextResponse.json({ ok: true });
}

/** Classe le PDF signé (généré + signé conservés ; le signé fait foi). archiveDocument = upsert idempotent. */
async function finalizeSignature(dossierId: string, submissionId: number, event: DocusealEvent): Promise<void> {
  let docs = event.data?.documents ?? [];
  if (docs.length === 0) docs = await getSubmissionDocuments(submissionId);

  for (const docMeta of docs) {
    const pdf = await downloadSignedDocument(docMeta.url);
    await archiveDocument({
      dossierId, piece: "convention", variant: "signe", pdf, generatedAt: new Date().toISOString(),
    });
  }

  await setPieceStatus({
    dossierId, piece: "convention", status: "signee",
    docusealSubmissionId: submissionId, at: new Date().toISOString(),
  });

  // Audit : trace la signature dans le journal général (en plus de webhook_events).
  await journal("dossier", dossierId, "convention_signee", {
    submission_id: submissionId,
    event_type: event.event_type,
  });
 }

/** Fiche d'analyse du besoin signée (stagiaire + centre) : archive le PDF signé et passe la pièce à « signée ». */
async function finalizeFicheBesoinSignature(dossierId: string, submissionId: number, event: DocusealEvent): Promise<void> {
  let docs = event.data?.documents ?? [];
  if (docs.length === 0) docs = await getSubmissionDocuments(submissionId);
  for (const docMeta of docs) {
    const pdf = await downloadSignedDocument(docMeta.url);
    await archiveDocument({ dossierId, piece: "fiche_analyse_besoin", variant: "signe", pdf, generatedAt: new Date().toISOString() });
  }
  await setPieceStatus({ dossierId, piece: "fiche_analyse_besoin", status: "signee", docusealSubmissionId: submissionId, at: new Date().toISOString() });
  await journal("dossier", dossierId, "fiche_besoin_signee", { submission_id: submissionId, event_type: event.event_type });
}

/** Engagement de confidentialité signé : stocke le PDF signé dans le bucket et passe à « signée ». */
async function finalizeConfidentialiteSignature(confidId: string, submissionId: number, event: DocusealEvent): Promise<void> {
  let docs = event.data?.documents ?? [];
  if (docs.length === 0) docs = await getSubmissionDocuments(submissionId);
  let chemin: string | null = null;
  if (docs[0]?.url) {
    const pdf = await downloadSignedDocument(docs[0].url);
    chemin = `confidentialite/${confidId}/contrat_signe_${Date.now()}.pdf`;
    await supabaseAdmin.storage.from("documents").upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
  }
  await supabaseAdmin.from("contrats_confidentialite")
    .update({ statut: "signee", signe_le: new Date().toISOString(), fichier_signe_path: chemin })
    .eq("id", confidId);
  await journal("confidentialite", confidId, "confid_signe", { submission_id: submissionId });
}

/** Onboarding formateur : stocke le PDF signé dans le bucket et passe le document à « signée ». */
async function finalizeFormateurSignature(externalId: string, submissionId: number, event: DocusealEvent): Promise<void> {
  const [, formateurId, type] = externalId.split(":");
  if (!formateurId || !type) return;

  let docs = event.data?.documents ?? [];
  if (docs.length === 0) docs = await getSubmissionDocuments(submissionId);

  let chemin: string | null = null;
  if (docs[0]?.url) {
    const pdf = await downloadSignedDocument(docs[0].url);
    chemin = `formateurs/${formateurId}/${type}_signe_${Date.now()}.pdf`;
    await supabaseAdmin.storage.from("documents").upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
  }

  await supabaseAdmin
    .from("formateur_documents")
    .update({ statut: "signee", signe_le: new Date().toISOString(), fichier_signe_path: chemin })
    .eq("formateur_id", formateurId).eq("type", type).eq("docuseal_submission_id", submissionId);

  await journal("formateur", formateurId, "formateur_doc_signe", { type, submission_id: submissionId });
}
