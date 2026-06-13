/**
 * MYSTORY — POST /api/documents/envoyer-dossier
 * Envoie TOUS les documents archivés d'un dossier au stagiaire, en une fois, via n8n.
 * Le CRM ne fait pas l'email lui-même : il rassemble les pièces, fabrique des URLs signées
 * (24 h) et transmet le tout au webhook n8n, qui compose un seul email avec les pièces jointes.
 *
 * Repli propre (drapeau) : si N8N_WEBHOOK_ENVOI_DOSSIER est absent, on ne casse rien —
 * on renvoie un statut « canal_inactif » et on trace au journal (même règle que l'email Resend).
 *
 * Body : { dossierId: string }
 * Conformité : lieu de formation = Gagny ; on n'envoie que des pièces déjà archivées
 * (donc déjà passées par les portes de conformité) ; la version signée prime sur la générée.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche, getSignedUrl } from "@/lib/crm";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Libellés lisibles pour l'email (n8n peut aussi les remapper côté workflow).
const LIBELLE: Record<string, string> = {
  convention: "Convention de formation",
  convocation: "Convocation",
  programme: "Programme de formation",
  reglement_interieur: "Règlement intérieur",
  planning: "Planning",
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  evaluation_finale: "Évaluation finale",
  attestation_fin: "Attestation de fin de formation",
  certificat_realisation: "Certificat de réalisation",
  feuille_emargement: "Feuille d'émargement",
};

export async function POST(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let dossierId: string;
  try { ({ dossierId } = await req.json()); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  if (!dossierId) return NextResponse.json({ ok: false, erreur: "dossierId requis." }, { status: 400 });

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  const f = fiche as unknown as { civilite?: string; nom: string; prenom: string; email?: string; certif?: string };
  if (!f.email) {
    return NextResponse.json({ ok: false, status: "email_manquant", erreur: "Email du stagiaire manquant : impossible d'envoyer." }, { status: 409 });
  }

  // Pièces archivées : la version signée prime sur la générée (une pièce = une entrée).
  const { data: arch, error } = await supabaseAdmin
    .from("archives")
    .select("piece_type, variant, url")
    .eq("dossier_id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  if (!arch || arch.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun document archivé : générez d'abord les documents du dossier." }, { status: 409 });
  }

  const meilleure = new Map<string, { piece_type: string; variant: string; url: string }>();
  for (const a of arch as any[]) {
    const prev = meilleure.get(a.piece_type);
    if (!prev || (a.variant === "signe" && prev.variant !== "signe")) meilleure.set(a.piece_type, a);
  }

  // URLs signées 24 h (n8n a le temps de récupérer les PDF).
  const documents: Array<{ piece: string; libelle: string; variant: string; url: string }> = [];
  for (const a of meilleure.values()) {
    try {
      const url = await getSignedUrl(a.url, 86400);
      documents.push({ piece: a.piece_type, libelle: LIBELLE[a.piece_type] ?? a.piece_type, variant: a.variant, url });
    } catch {
      // une pièce illisible ne bloque pas l'envoi des autres
    }
  }
  if (documents.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun PDF lisible à transmettre." }, { status: 409 });
  }

  const webhook = process.env.N8N_WEBHOOK_ENVOI_DOSSIER;
  const payload = {
    dossierId,
    certif: f.certif ?? "",
    lieu_formation: "Gagny",
    stagiaire: { civilite: f.civilite ?? "", nom: f.nom, prenom: f.prenom, email: f.email },
    documents,
  };

  // Repli drapeau : pas de webhook configuré → on ne casse rien, on signale.
  if (!webhook) {
    await journal("dossier", dossierId, "envoi_dossier_canal_inactif", { nb: documents.length });
    return NextResponse.json(
      { ok: false, status: "canal_inactif", erreur: "Canal n8n non configuré (variable N8N_WEBHOOK_ENVOI_DOSSIER absente sur Vercel)." },
      { status: 503 },
    );
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.N8N_WEBHOOK_SECRET) headers["X-MYSTORY-SECRET"] = process.env.N8N_WEBHOOK_SECRET;
    const r = await fetch(webhook, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      await journal("dossier", dossierId, "envoi_dossier_echec", { statut_http: r.status, nb: documents.length });
      return NextResponse.json({ ok: false, status: "echec_n8n", erreur: `n8n a répondu ${r.status}. ${txt.slice(0, 200)}` }, { status: 502 });
    }
    await journal("dossier", dossierId, "documents_envoyes_n8n", { nb: documents.length, pieces: documents.map((d) => d.piece), email: f.email });
    return NextResponse.json({ ok: true, status: "transmis_n8n", nbDocuments: documents.length });
  } catch (e) {
    await journal("dossier", dossierId, "envoi_dossier_echec", { erreur: String(e), nb: documents.length });
    return NextResponse.json({ ok: false, status: "echec_n8n", erreur: String(e) }, { status: 502 });
  }
}
