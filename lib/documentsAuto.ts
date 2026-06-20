// lib/documentsAuto.ts
// Génère un document de FIN (attestation_fin | certificat_realisation) pour un dossier
// et l'envoie au stagiaire par email (PDF en pièce jointe).
// Best-effort : ne jette jamais — retourne { ok, erreur? } — pour ne JAMAIS bloquer
// la clôture de formation ni la validation du service fait.
// Garde-fou conformité : on ne produit pas de document de fin avant la fin réelle de la
// formation (date_fin) et sans heures réalisées renseignées (anti-antidate).
import { mergeTemplate } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { getFiche, archiveDocument, setPieceStatus } from "@/lib/crm";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

type DocFin = "attestation_fin" | "certificat_realisation";

const LIBELLE: Record<DocFin, string> = {
  attestation_fin: "votre attestation de fin de formation",
  certificat_realisation: "votre certificat de réalisation",
};
const OBJET: Record<DocFin, string> = {
  attestation_fin: "Votre attestation de fin de formation — MYSTORY Formation",
  certificat_realisation: "Votre certificat de réalisation — MYSTORY Formation",
};

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function genererEtEnvoyerDocFin(
  dossierId: string,
  type: DocFin,
  auteur?: string | null,
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    let fiche: any;
    try { fiche = await getFiche(dossierId); }
    catch (e: any) { return { ok: false, erreur: e?.message || "Fiche indisponible." }; }
    if (!fiche) return { ok: false, erreur: "Dossier introuvable." };

    // Anti-antidate : pas de document de fin avant la fin réelle + heures réalisées.
    const fin: string | null | undefined = fiche.dateFin;
    if (!fin) return { ok: false, erreur: "Date de fin absente : document non généré." };
    if (fin > aujourdHuiParisISO()) return { ok: false, erreur: "Formation non terminée : document non généré." };
    if (fiche.heuresRealisees == null) return { ok: false, erreur: "Heures réalisées non renseignées." };

    const merge = mergeTemplate(type, fiche);
    if (merge.missing.length > 0) return { ok: false, erreur: `Champs requis manquants : ${merge.missing.join(", ")}` };

    const { pdf } = await renderHtmlToPdf({ html: merge.html, name: `${type} — ${fiche.prenom} ${fiche.nom}` });
    await archiveDocument({ dossierId, piece: type, variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: type, status: "genere", at: new Date().toISOString() });

    if (!fiche.email) {
      await journal("dossier", dossierId, `${type}_genere_sans_email`, {}, auteur ?? "auto");
      return { ok: false, erreur: "Document généré mais aucun email stagiaire pour l'envoi." };
    }

    const corps = `<p>Bonjour ${fiche.civilite ?? ""} ${fiche.nom} ${fiche.prenom},</p>
      <p>Vous trouverez ci-joint ${LIBELLE[type]}.</p>
      <p>Pour toute question, écrivez-nous à contact@mystoryformation.fr ou appelez le 06 81 43 16 54.</p>
      <p>Bien cordialement,<br/>L'équipe MYSTORY Formation</p>`;
    const env = await envoyerEmail({
      a: fiche.email,
      objet: OBJET[type],
      html: gabaritEmail(OBJET[type], corps),
      piecesJointes: [{ nom: `${type}.pdf`, contenu: pdf }],
      entite: "dossier",
      entiteId: dossierId,
    });
    if (!env.ok) {
      await journal("dossier", dossierId, `${type}_envoi_ko`, { erreur: env.erreur }, auteur ?? "auto");
      return { ok: false, erreur: env.erreur || "Email non envoyé (document généré)." };
    }
    await journal("dossier", dossierId, `${type}_envoye`, { email: fiche.email }, auteur ?? "auto");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erreur: e?.message || "Erreur génération/envoi." };
  }
}
