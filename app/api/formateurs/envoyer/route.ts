/**
 * MYSTORY — POST /api/formateurs/envoyer  (6b — charte/contrat formateur en signature)
 * Body { formateurId, type:"charte"|"contrat" }.
 * Fusionne le document, l'envoie en signature DocuSeal (signataire = Formateur), enregistre le suivi.
 * external_id = « formateur:<id>:<type> » → le webhook route le retour signé. Idempotent.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createFormateurSubmissionFromHtml } from "@/lib/docuseal";
import { charteHtml, contratHtml, type FormateurDoc } from "@/lib/formateurDocs";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function peutGerer(role?: string): boolean {
  return !role || role === "staff" || role === "direction";
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peutGerer(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const formateurId = String(b?.formateurId ?? "").trim();
  const type = String(b?.type ?? "").trim();
  if (!formateurId) return NextResponse.json({ ok: false, erreur: "formateurId requis." }, { status: 400 });
  if (!["charte", "contrat"].includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide (charte|contrat)." }, { status: 400 });

  const { data: f, error: eF } = await supabaseAdmin
    .from("formateurs").select("id, civilite, prenom, nom, email, telephone, type, raison_sociale, siret, adresse").eq("id", formateurId).single();
  if (eF || !f) return NextResponse.json({ ok: false, erreur: "Formateur introuvable." }, { status: 404 });
  if (!(f as any).email) return NextResponse.json({ ok: false, erreur: "Ce formateur n'a pas d'email — ajoute-le d'abord." }, { status: 400 });

  // Idempotence : si déjà envoyé/signé, on ne renvoie pas.
  const { data: existant } = await supabaseAdmin
    .from("formateur_documents").select("id, statut").eq("formateur_id", formateurId).eq("type", type)
    .in("statut", ["envoye_a_signer", "signee"]).maybeSingle();
  if (existant) return NextResponse.json({ ok: true, skipped: true, statut: (existant as any).statut });

  const doc = f as FormateurDoc;
  const html = type === "charte" ? charteHtml(doc) : contratHtml(doc);
  const documentName = type === "charte"
    ? `Charte du formateur — ${doc.prenom ?? ""} ${doc.nom}`.trim()
    : `Contrat de sous-traitance — ${doc.prenom ?? ""} ${doc.nom}`.trim();

  try {
    const submission = await createFormateurSubmissionFromHtml({
      html,
      formateur: { email: (f as any).email, nom: doc.nom, prenom: doc.prenom ?? undefined },
      externalId: `formateur:${formateurId}:${type}`,
      documentName,
    });
    const { error: eIns } = await supabaseAdmin.from("formateur_documents").insert({
      formateur_id: formateurId, type, statut: "envoye_a_signer",
      docuseal_submission_id: submission.submissionId, sign_url: submission.signUrl ?? null, slug: submission.slug ?? null,
      auteur: u.email ?? null,
    });
    if (eIns) return NextResponse.json({ ok: false, erreur: eIns.message }, { status: 500 });
    await journal("formateur", formateurId, "formateur_doc_envoye", { type, submission_id: submission.submissionId }, u.email ?? null);
    return NextResponse.json({ ok: true, submissionId: submission.submissionId, signUrl: submission.signUrl ?? null });
  } catch (e: any) {
    await supabaseAdmin.from("formateur_documents").insert({ formateur_id: formateurId, type, statut: "erreur", auteur: u.email ?? null });
    return NextResponse.json({ ok: false, erreur: String(e?.message ?? e) }, { status: 502 });
  }
}
