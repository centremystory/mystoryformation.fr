/**
 * MYSTORY — Couche CRM (Phase 2) : implémente sur Supabase tous les // ADAPTER du code 2A→2D.
 * Les routes Vercel importent ces fonctions à la place des stubs.
 *
 * Statuts de pièce = enum SQL canonique :
 *   'manquant' | 'genere' | 'envoye_a_signer' | 'signature_en_cours' | 'signee' | 'erreur_envoi'
 *
 * Formatrice : le « formateur » de la convention/convocation = la formatrice RÉFÉRENT du dossier
 * (dossiers.formatrice_id). Le gate FLE porte sur elle. planning.formatrice_id reste pour le per-séance
 * (émargement).
 */
import { supabaseAdmin } from "./supabaseAdmin";
import type { FicheStagiaire } from "./mergeEngine";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

export type PieceStatut =
  | "manquant" | "genere" | "envoye_a_signer" | "signature_en_cours" | "signee" | "erreur_envoi";

// ---------------------------------------------------------------------------
// getFiche : dossier + stagiaire + formatrices du planning → forme attendue par le moteur
// ---------------------------------------------------------------------------
export async function getFiche(dossierId: string): Promise<FicheStagiaire | null> {
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select(`
      id, certif, financement, montant, numero_edof, session_edof,
      niveau_initial, niveau_vise, niveau_atteint,
      heures_prevues, date_debut, date_fin,
      stagiaire:stagiaires!inner (
        civilite, nom, prenom, date_naissance, ville_naissance,
        adresse, cp, ville, email, telephone, agence
      ),
      formatrice:formatrices!formatrice_id ( nom, prenom ),
      planning ( date_seance, heures )
    `)
    .eq("id", dossierId)
    .single();
  if (error || !data) return null;
  const d = data as any;
  const s = d.stagiaire;
  const ref = d.formatrice;
  const formatrice = ref ? `${ref.prenom ?? ""} ${ref.nom}`.trim() : null;
  return {
    civilite: s.civilite, nom: s.nom, prenom: s.prenom,
    dateNaissance: s.date_naissance, villeNaissance: s.ville_naissance,
    adresse: s.adresse, cp: s.cp, ville: s.ville, email: s.email, telephone: s.telephone,
    agence: s.agence, certif: d.certif,
    numeroDossier: d.numero_edof, sessionEdof: d.session_edof,
    formatrice, niveauAtteint: d.niveau_atteint,
    heuresPrevues: d.heures_prevues, dateDebut: d.date_debut, dateFin: d.date_fin,
    montant: d.montant,
    planning: (d.planning ?? []).map((p: any) => ({ date: p.date_seance, heures: Number(p.heures) })),
  } as unknown as FicheStagiaire;
}

/** Gate FLE : la formatrice RÉFÉRENT (dossiers.formatrice_id) doit avoir un justificatif FLE. */
export async function assertFormatriceFle(dossierId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("formatrice:formatrices!formatrice_id ( nom, justificatif_fle )")
    .eq("id", dossierId)
    .single();
  if (error) throw error;
  const ref = (data as any)?.formatrice;
  if (!ref) throw new Error("Gate FLE: formatrice référent non assignée (dossiers.formatrice_id).");
  if (!ref.justificatif_fle) {
    throw new Error(`Gate FLE: la formatrice référent ${ref.nom} n'a pas de justificatif FLE au dossier.`);
  }
}

// ---------------------------------------------------------------------------
// archiveDocument : upload PDF dans Storage + UPSERT archives (idempotent)
// ---------------------------------------------------------------------------
export async function archiveDocument(args: {
  dossierId: string;
  piece: string;
  variant: "genere" | "signe";
  pdf: Buffer;
  generatedAt?: string; // ignoré côté DB : generated_at est forcé à now() par trigger (anti-antidate)
}): Promise<void> {
  const path = `${args.dossierId}/${args.piece}_${args.variant}.pdf`;

  const up = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, args.pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;

  // UPSERT sur la clé (dossier_id, piece_type, variant) → un rejeu écrase, ne duplique pas.
  const { error } = await supabaseAdmin
    .from("archives")
    .upsert(
      { dossier_id: args.dossierId, piece_type: args.piece, variant: args.variant, url: path },
      { onConflict: "dossier_id,piece_type,variant" },
    );
  if (error) throw error;
}

/** URL signée temporaire pour consulter un PDF archivé (bucket privé). */
export async function getSignedUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (error || !data) throw error ?? new Error("URL signée indisponible");
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// setPieceStatus : met à jour le statut (le trigger SQL recalcule le dossier)
// ---------------------------------------------------------------------------
export async function setPieceStatus(args: {
  dossierId: string;
  piece: string;
  status: PieceStatut;
  docusealSubmissionId?: number;
  at?: string; // horodatage géré par le trigger pieces_before
}): Promise<void> {
  const patch: Record<string, unknown> = { statut: args.status };
  if (args.docusealSubmissionId != null) patch.docuseal_submission_id = args.docusealSubmissionId;

  const { error } = await supabaseAdmin
    .from("pieces")
    .update(patch)
    .eq("dossier_id", args.dossierId)
    .eq("type", args.piece);
  if (error) throw error;
}

/** Recalcul explicite (déjà fait par trigger ; ceinture + bretelles pour le webhook). */
export async function recomputeDossierStatus(dossierId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("recompute_dossier_statut", { p_dossier: dossierId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Idempotence DocuSeal (webhook_events)
// ---------------------------------------------------------------------------
export async function isEventProcessed(eventKey: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("webhook_events")
    .select("id")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function markEventProcessed(
  eventKey: string,
  meta?: { submissionId?: number; eventType?: string; dossierId?: string | null; payload?: unknown },
): Promise<void> {
  // Repli : parse `${submission_id}:${event_type}` depuis la clé.
  const sep = eventKey.indexOf(":");
  const subPart = sep >= 0 ? eventKey.slice(0, sep) : "";
  const evtPart = sep >= 0 ? eventKey.slice(sep + 1) : eventKey;

  const { error } = await supabaseAdmin.from("webhook_events").upsert(
    {
      event_key: eventKey,
      submission_id: meta?.submissionId ?? (Number.isFinite(Number(subPart)) ? Number(subPart) : null),
      event_type: meta?.eventType ?? evtPart,
      dossier_id: meta?.dossierId ?? null,
      payload: (meta?.payload as object) ?? null,
    },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// findDossierBySubmission : via pieces.docuseal_submission_id (posé à l'envoi)
// ---------------------------------------------------------------------------
export async function findDossierBySubmission(submissionId: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("pieces")
    .select("dossier_id")
    .eq("docuseal_submission_id", submissionId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.dossier_id ?? null;
}

/** Statut courant de la pièce convention (pour l'idempotence d'envoi). */
export async function getConventionStatus(dossierId: string): Promise<PieceStatut | null> {
  const { data, error } = await supabaseAdmin
    .from("pieces")
    .select("statut")
    .eq("dossier_id", dossierId)
    .eq("type", "convention")
    .maybeSingle();
  if (error) throw error;
  return ((data as any)?.statut ?? null) as PieceStatut | null;
}
