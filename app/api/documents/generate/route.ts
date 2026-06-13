/**
 * MYSTORY — POST /api/documents/generate  (documents NON signés)
 * Génère un document à partir de son gabarit, le fait rendre en PDF par DocuSeal
 * (rendu pur, sans signature), l'archive et met à jour la pièce du dossier.
 *
 * Body : { dossierId: string, type: string }
 * Types pris en charge : convocation, emargement, programme, reglement_interieur,
 * planning, attestation_fin, certificat_realisation.
 * (La convention a sa propre route /api/conventions/send — circuit signature.)
 *
 * Verrous de conformité :
 *  - Lieu = Gagny forcé par le moteur de fusion (jamais fiche.agence).
 *  - attestation_fin / certificat_realisation : INTERDITS tant que la formation
 *    n'est pas terminée (anti-antidate — jamais de document de fin avant la fin),
 *    et durée = heures RÉALISÉES (cohérence service fait).
 *  - programme : gabarit LEVELTEL non fourni → génération bloquée pour LEVELTEL.
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate, TEMPLATES, FicheStagiaire } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche, archiveDocument, setPieceStatus, getSignedUrl } from "@/lib/crm";
import { genererFeuilleEmargementHtml } from "@/lib/emargement";

export const runtime = "nodejs";
export const maxDuration = 60;

// Type moteur (gabarit) → type de pièce dans la table `pieces`.
// NB : corrige le bug emargement/feuille_emargement (la pièce ne passait pas en « généré »).
const PIECE_TYPE: Record<string, string> = {
  convocation: "convocation",
  emargement: "feuille_emargement",
  programme: "programme",
  reglement_interieur: "reglement_interieur",
  planning: "planning",
  attestation_fin: "attestation_fin",
  certificat_realisation: "certificat_realisation",
};

// Documents de FIN de formation : générables uniquement quand la formation est terminée.
const DOCS_FIN = new Set(["attestation_fin", "certificat_realisation"]);

/** Date du jour (Europe/Paris) au format YYYY-MM-DD. */
function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Dernière date de séance (ou date_fin du dossier) au format YYYY-MM-DD, sinon null. */
function dateFinISO(fiche: FicheStagiaire): string | null {
  const dates = (fiche.planning ?? []).map((s) => s.date).filter(Boolean) as string[];
  if (dates.length > 0) return [...dates].sort().slice(-1)[0];
  return fiche.dateFin ?? null;
}

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
  if (!PIECE_TYPE[type] || !TEMPLATES[type]) {
    return NextResponse.json({ error: `Type de document non pris en charge : ${type}` }, { status: 400 });
  }
  const pieceType = PIECE_TYPE[type];

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  // Feuille d'émargement : produite À PARTIR DU RÉEL (signatures capturées), jamais pré-remplie.
  // Si aucune demi-journée n'est émargée → 409 (interdiction de générer une feuille vide/anticipée).
  if (type === "emargement") {
    const feuille = await genererFeuilleEmargementHtml(dossierId);
    if (!feuille) {
      return NextResponse.json(
        { ok: false, dossierId, type, status: "aucun_emargement",
          recap: ["Aucune demi-journée émargée : la feuille d'émargement ne peut pas être générée (interdiction de pré-remplir). Faites d'abord émarger au moins une séance."] },
        { status: 409 },
      );
    }
    try {
      const { pdf, submissionId } = await renderHtmlToPdf({ html: feuille.html, name: `emargement — ${fiche.prenom} ${fiche.nom}` });
      await archiveDocument({ dossierId, piece: pieceType, variant: "genere", pdf, generatedAt: new Date().toISOString() });
      await setPieceStatus({ dossierId, piece: pieceType, status: "genere", at: new Date().toISOString() });
      const pdfUrl = await getSignedUrl(`${dossierId}/${pieceType}_genere.pdf`, 3600);
      const f = fiche as unknown as { civilite?: string; nom: string; prenom: string; email: string };
      return NextResponse.json({
        ok: true, dossierId, type, submissionId, status: "genere", pdfUrl,
        nbSeances: feuille.nbSeances, totalHeures: feuille.totalHeures,
        stagiaire: { civilite: f.civilite ?? "", nom: f.nom, prenom: f.prenom, email: f.email },
      });
    } catch (e) {
      await setPieceStatus({ dossierId, piece: pieceType, status: "erreur_envoi", at: new Date().toISOString() });
      return NextResponse.json({ ok: false, dossierId, type, status: "erreur", error: String(e) }, { status: 502 });
    }
  }

  // Gabarit programme : contenu juridique propre à chaque certification.
  // TEF IRN → templates/programme.html · LEVELTEL FLE → templates/programme_leveltel.html (modèle v3 fourni).
  const templateId = type === "programme" && fiche.certif === "LEVELTEL" ? "programme_leveltel" : type;

  // Anti-antidate : pas d'attestation ni de certificat avant la fin réelle de la formation.
  if (DOCS_FIN.has(type)) {
    const fin = dateFinISO(fiche);
    const recap: string[] = [];
    if (!fin) recap.push("Date de fin introuvable (aucune séance au planning).");
    else if (fin > aujourdHuiParisISO()) {
      recap.push(`La formation se termine le ${fin} : impossible de générer un document de fin avant cette date (anti-antidate).`);
    }
    if (fiche.heuresRealisees === undefined || fiche.heuresRealisees === null) {
      recap.push("Heures réalisées non renseignées sur le dossier — à saisir avant de produire les documents de fin (durée = heures réellement effectuées).");
    }
    if (recap.length > 0) {
      return NextResponse.json({ ok: false, dossierId, type, status: "gate_ko", recap }, { status: 409 });
    }
  }

  // Fusion (lieu = Gagny forcé) ; champs requis manquants -> 409 + recap
  const merge = mergeTemplate(templateId, fiche);
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

    await archiveDocument({ dossierId, piece: pieceType, variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: pieceType, status: "genere", at: new Date().toISOString() });

    // URL signée (1 h) + infos stagiaire : permet à n8n de joindre le PDF
    // et de personnaliser l'email sans requête supplémentaire.
    const pdfUrl = await getSignedUrl(`${dossierId}/${pieceType}_genere.pdf`, 3600);
    const f = fiche as unknown as {
      civilite?: string; nom: string; prenom: string; email: string;
      certif?: string; dateDebut?: string;
    };
    return NextResponse.json({
      ok: true, dossierId, type, submissionId, status: "genere",
      pdfUrl,
      stagiaire: { civilite: f.civilite ?? "", nom: f.nom, prenom: f.prenom, email: f.email },
      certif: f.certif ?? "",
      dateDebut: f.dateDebut ?? "",
    });
  } catch (e) {
    await setPieceStatus({ dossierId, piece: pieceType, status: "erreur_envoi", at: new Date().toISOString() });
    return NextResponse.json({ ok: false, dossierId, type, status: "erreur", error: String(e) }, { status: 502 });
  }
}
