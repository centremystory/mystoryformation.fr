/**
 * MYSTORY — POST /api/documents/generate  (documents NON signés)
 * Génère un document (convocation, puis attestation, certificat...) à partir de son gabarit,
 * le fait rendre en PDF par DocuSeal (rendu pur, sans signature), l'archive et met à jour la pièce.
 *
 * Body : { dossierId: string, type: string }   ex. type = "convocation"
 * Auth obligatoire (middleware + requireUser). Lieu = Gagny forcé par le moteur de fusion.
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate, TEMPLATES } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche, archiveDocument, setPieceStatus } from "@/lib/crm";

export const runtime = "nodejs";
export const maxDuration = 60;

// Documents NON signés autorisés ici (la convention a sa propre route /api/conventions/send).
// On étendra au fur et à mesure : attestation, certificat, fiche_besoin, evaluation...
const ALLOWED = new Set<string>(["convocation", "emargement"]);

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let dossierId: string, type: string;
  try {
    ({ dossierId, type } = await req.json());
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!dossierId || !type) return NextResponse.json({ error: "dossierId et type requis" }, { status: 400 });
  if (!ALLOWED.has(type) || !TEMPLATES[type]) {
    return NextResponse.json({ error: `Type de document non pris en charge : ${type}` }, { status: 400 });
  }

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  // Fusion (lieu = Gagny forcé) ; champs requis manquants -> 409 + recap
  const merge = mergeTemplate(type, fiche);
  if (merge.missing.length > 0) {
    return NextResponse.json(
      { ok: false, dossierId, type, status: "champs_manquants", recap: merge.missing.map((m) => `Champ requis manquant : ${m}`) },
      { status: 409 },
    );
  }

  try {
    const { pdf, submissionId } = await renderHtmlToPdf({
      html: merge.html,
      name: `${type} — ${fiche.prenom} ${fiche.nom}`,
    });

    await archiveDocument({ dossierId, piece: type, variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: type, status: "genere", at: new Date().toISOString() });

    return NextResponse.json({ ok: true, dossierId, type, submissionId, status: "genere" });
  } catch (e) {
    await setPieceStatus({ dossierId, piece: type, status: "erreur_envoi", at: new Date().toISOString() });
    return NextResponse.json({ ok: false, dossierId, type, status: "erreur", error: String(e) }, { status: 502 });
  }
}
