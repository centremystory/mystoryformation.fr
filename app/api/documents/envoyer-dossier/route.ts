/**
 * MYSTORY — POST /api/documents/envoyer-dossier
 * Envoie TOUS les documents archivés d'un dossier au stagiaire, en un seul email,
 * via le canal interne du CRM (Resend, lib/email.ts) : les PDF sont joints directement.
 *
 * Pourquoi pas n8n : le CRM possède déjà un canal email avec pièces jointes et journal ;
 * on évite une pièce mobile supplémentaire. Si RESEND_API_KEY est absente, l'envoi est
 * désactivé proprement (message clair, jamais de crash) — drapeau géré dans lib/email.ts.
 *
 * Body : { dossierId: string }
 * Conformité : on n'envoie que des pièces déjà archivées (donc déjà passées par les portes
 * de conformité) ; la version signée prime sur la générée ; lieu de formation = Gagny.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche } from "@/lib/crm";
import { envoyerEmail, gabaritEmail, type PieceJointe } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

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
const CERTIF_LISIBLE: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

/** Nom de fichier sûr : ASCII, underscores, .pdf. */
function nomFichier(libelle: string, nom: string): string {
  const base = `${libelle}_${nom}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "document"}.pdf`;
}

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

  // Pièces archivées : signé prioritaire sur généré (une pièce = une entrée).
  const { data: arch, error } = await supabaseAdmin
    .from("archives").select("piece_type, variant, url").eq("dossier_id", dossierId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  if (!arch || arch.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun document archivé : générez d'abord les documents du dossier." }, { status: 409 });
  }
  const meilleure = new Map<string, { piece_type: string; variant: string; url: string }>();
  for (const a of arch as any[]) {
    const prev = meilleure.get(a.piece_type);
    if (!prev || (a.variant === "signe" && prev.variant !== "signe")) meilleure.set(a.piece_type, a);
  }

  // Téléchargement des PDF depuis le Storage privé → pièces jointes.
  const pieces: PieceJointe[] = [];
  const noms: string[] = [];
  for (const a of meilleure.values()) {
    try {
      const dl = await supabaseAdmin.storage.from(BUCKET).download(a.url);
      if (dl.error || !dl.data) continue;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      const libelle = LIBELLE[a.piece_type] ?? a.piece_type;
      pieces.push({ nom: nomFichier(libelle, f.nom), contenu: buf });
      noms.push(libelle);
    } catch {
      // une pièce illisible ne bloque pas l'envoi des autres
    }
  }
  if (pieces.length === 0) {
    return NextResponse.json({ ok: false, status: "aucun_document", erreur: "Aucun PDF lisible à joindre." }, { status: 409 });
  }

  const certif = CERTIF_LISIBLE[f.certif ?? ""] ?? f.certif ?? "";
  const liste = noms.map((n) => `<li>${n}</li>`).join("");
  const corps = `
    Bonjour ${f.civilite ? f.civilite + " " : ""}${f.nom},<br><br>
    Veuillez trouver ci-joint les documents de votre formation${certif ? ` ${certif}` : ""} :
    <ul style="margin:8px 0 8px 0;padding-left:20px;">${liste}</ul>
    Pour toute question, vous pouvez répondre directement à cet email.<br><br>
    Bien cordialement,<br>L'équipe MYSTORY Formation`;

  const res = await envoyerEmail({
    a: f.email,
    objet: "MYSTORY — vos documents de formation",
    html: gabaritEmail("Vos documents de formation", corps),
    piecesJointes: pieces,
    entite: "dossiers",
    entiteId: dossierId,
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, status: "envoi_inactif", erreur: res.erreur ?? "Envoi impossible." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, status: "envoye", nbDocuments: pieces.length });
}
