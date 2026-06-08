/**
 * MYSTORY — POST /api/webhooks/docuseal  (Brique 2D + Phase 2, branché Supabase)
 * 1) corps brut → 2) vérif HMAC → 3) idempotence (webhook_events) → 4) maj pièces + recompute.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhook, downloadSignedDocument, getSubmissionDocuments, SIGNERS_COUNT, type DocusealEvent,
} from "@/lib/docuseal";
import {
  isEventProcessed, markEventProcessed, findDossierBySubmission,
  setPieceStatus, archiveDocument, recomputeDossierStatus,
} from "@/lib/crm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyWebhook(rawBody, req.headers)) {
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
