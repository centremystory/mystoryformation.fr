/**
 * MYSTORY — POST /api/conventions/send  (Brique 2D + Phase 2, branché Supabase)
 * Auth obligatoire (middleware + requireUser). Gates 2B → 409 + recap si KO.
 * Génère la Convention (lieu = Gagny), archive, envoie en signature DocuSeal (OF auto-signé + stagiaire).
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate } from "@/lib/mergeEngine";
import { renderPdf } from "@/lib/renderPdf";
import { createConventionSubmission } from "@/lib/docuseal";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche, archiveDocument, setPieceStatus, getConventionStatus } from "@/lib/crm";
import { checkConformite } from "@/lib/gates";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 🔒 Auth (session CRM ou JWT de service n8n signé avec AUTH_SECRET)
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let dossierId: string;
  try {
    ({ dossierId } = await req.json());
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!dossierId) return NextResponse.json({ error: "dossierId requis" }, { status: 400 });

  // Idempotence d'envoi : si la convention est déjà partie/signée, on NE renvoie PAS (anti-doublon/spam).
  const conv = await getConventionStatus(dossierId);
  if (conv && ["envoye_a_signer", "signature_en_cours", "signee"].includes(conv)) {
    return NextResponse.json({ ok: true, dossierId, status: "deja_envoye", skipped: true });
  }

  // Gates de conformité 2B → 409 + recap (n8n lit le 409, ne refait pas les contrôles)
  const gate = await checkConformite(dossierId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, dossierId, status: "gate_ko", recap: gate.recap }, { status: 409 });
  }

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  // Fusion Convention — le moteur force lieu de formation + « Fait à » = Gagny.
  const merge = mergeTemplate("convention", fiche);
  if (merge.missing.length > 0) {
    return NextResponse.json(
      { ok: false, dossierId, status: "gate_ko", recap: merge.missing.map((m) => `Champ requis manquant : ${m}`) },
      { status: 409 },
    );
  }

  const pdf = await renderPdf(merge.html);
  await archiveDocument({
    dossierId, piece: "convention", variant: "genere", pdf, generatedAt: new Date().toISOString(),
  });

  try {
    const submission = await createConventionSubmission({
      conventionPdfBase64: pdf.toString("base64"),
      dossierId,
      stagiaire: { email: fiche.email, nom: fiche.nom, prenom: fiche.prenom },
    });
    await setPieceStatus({
      dossierId, piece: "convention", status: "envoye_a_signer",
      docusealSubmissionId: submission.submissionId, at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, dossierId, submissionId: submission.submissionId, status: "envoye_a_signer" });
  } catch (e) {
    await setPieceStatus({ dossierId, piece: "convention", status: "erreur_envoi", at: new Date().toISOString() });
    return NextResponse.json({ ok: false, dossierId, status: "erreur_envoi", error: String(e) }, { status: 502 });
  }
}
