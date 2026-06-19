/**
 * MYSTORY — lib/examens.ts  (module Examens : fusion, documents, envoi)
 * Lieu d'examen UNIQUE : Gagny — 3 bis av. de Gagny, 93220 (codé en dur dans les
 * gabarits, jamais dérivé de l'agence d'inscription — règle de conformité).
 *
 * Documents par vente (stockage privé `documents/examens/<venteId>/…`) :
 *  · attestation d'inscription et de paiement — TOUJOURS
 *  · convocation TEF ou civique — JAMAIS pour une vente plateforme
 */
import { readFileSync } from "fs";
import path from "path";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const COCHE = "☑";
const VIDE = "☐";
export const box = (on: boolean) => (on ? COCHE : VIDE);

export const SOUS_TYPES_CIVIQUE = ["Carte de séjour pluriannuelle", "Carte de résident", "Naturalisation"];
export const MOTIVATIONS_TEF = [
  "04. Intégration française",
  "05. Carte de séjour pluriannuelle",
  "06. Carte de résident en France",
  "10. Naturalisation française",
];
export const PLATEFORMES = ["Passetontef", "Prepcivique", "Prepmyfuture"];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Mini-moteur de fusion (mêmes balises {{...}} et {{#if}} que le moteur formation). */
export function fusionExamen(templateId: string, valeurs: Record<string, string | null | undefined>): string {
  const file = path.join(process.cwd(), "templates", `${templateId}.html`);
  let tpl = readFileSync(file, "utf8");
  tpl = tpl.replace(/\{\{#if\s+([a-z][a-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, k, inner) => (valeurs[k] ? inner : ""));
  tpl = tpl.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_m, k) => {
    const v = valeurs[k];
    if (v === null || v === undefined) return "";
    // Les images (cachet/signature) sont des URLs de confiance issues de l'environnement.
    return k.endsWith("_img") ? String(v) : escapeHtml(String(v));
  });
  return tpl;
}

export function valeursCachet(): Record<string, string | null> {
  return {
    of_signature_img: process.env.MYSTORY_OF_SIGNATURE_URL ?? null,
    cachet_img: process.env.MYSTORY_CACHET_URL ?? null,
    cachet_absent: process.env.MYSTORY_CACHET_URL ? null : "1",
  };
}

export function dateFR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(a, m - 1, j));
}
export function aujourdHuiFR(): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

export interface VenteComplete {
  vente: any;       // ligne ventes_examen
  candidat: any;    // ligne stagiaires
  session: any | null; // ligne sessions_examen (null si plateforme)
}

export async function chargerVente(venteId: string): Promise<VenteComplete | null> {
  const { data: vente } = await supabaseAdmin
    .from("ventes_examen")
    .select("*, stagiaires:candidat_id (*), sessions_examen:session_id (*)")
    .eq("id", venteId)
    .maybeSingle();
  if (!vente) return null;
  const { stagiaires: candidat, sessions_examen: session, ...reste } = vente as any;
  return { vente: reste, candidat, session: session ?? null };
}

function horaires(session: any | null): { debut: string; fin: string } {
  const h = String(session?.horaire ?? "");
  const [debut, fin] = h.split("-").map((x: string) => x.trim());
  return { debut: debut ?? "", fin: fin ?? "" };
}

/** Construit les valeurs de fusion communes (attestation + convocations). */
export function valeursVente(vc: VenteComplete, options?: { corrigee?: boolean }): Record<string, string | null> {
  const { vente, candidat, session } = vc;
  const { debut, fin } = horaires(session);
  const adresse = [candidat.adresse, [candidat.cp, candidat.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const estTef = vente.type_examen === "TEF_IRN";
  const estCiv = vente.type_examen === "Examen_civique";
  const estPlat = vente.type_examen === "Vente_plateforme";
  const st = String(vente.sous_type ?? "");

  return {
    ...valeursCachet(),
    numero_attestation: vente.numero_attestation,
    mention_corrigee: options?.corrigee ? "1" : null,
    num_etranger: candidat.num_piece_identite ?? "",
    civilite: candidat.civilite ?? "",
    nom: candidat.nom ?? "",
    prenom: candidat.prenom ?? "",
    date_naissance: candidat.date_naissance ? dateFR(candidat.date_naissance) : "",
    telephone: candidat.telephone ?? "",
    email: candidat.email ?? "",
    adresse_postale: adresse,
    coche_tef: box(estTef),
    motivation_tef: estTef ? (st || null) : null,
    coche_civique: box(estCiv),
    civ_pluriannuelle: box(estCiv && st === "Carte de séjour pluriannuelle"),
    civ_resident: box(estCiv && st === "Carte de résident"),
    civ_naturalisation: box(estCiv && st === "Naturalisation"),
    coche_plateforme: box(estPlat),
    app_passetontef: box(estPlat && st === "Passetontef"),
    app_prepcivique: box(estPlat && st === "Prepcivique"),
    app_prepmyfuture: box(estPlat && st === "Prepmyfuture"),
    session_ligne: session ? "1" : null,
    sans_session: session ? null : "1",
    session_type: session ? (session.type === "TEF_IRN" ? "TEF IRN" : "Examen civique") : "",
    date_examen: session ? dateFR(session.date_examen) : "",
    heure_debut: debut,
    heure_fin: fin,
    montant: String(vente.montant ?? ""),
    dont_cb: vente.mode_paiement === "Mixte" && vente.dont_cb ? String(vente.dont_cb) : null,
    pay_cb: box(vente.mode_paiement === "CB"),
    pay_especes: box(vente.mode_paiement === "Espèces"),
    pay_mixte: box(vente.mode_paiement === "Mixte"),
    reste_a_payer: String(vente.reste_a_payer ?? 0),
    date_emission: aujourdHuiFR(),
    referent: vente.vendu_par ?? "",
  };
}

export interface DocumentGenere {
  piece: "attestation" | "convocation";
  nomFichier: string;
  pdf: Buffer;
  chemin: string;
}

/** Génère (et archive en storage) l'attestation + la convocation éventuelle d'une vente. */
export async function genererDocumentsVente(vc: VenteComplete, options?: { corrigee?: boolean }): Promise<DocumentGenere[]> {
  const { vente, candidat } = vc;
  const valeurs = valeursVente(vc, options);
  const docs: DocumentGenere[] = [];

  const rendus: Array<{ piece: "attestation" | "convocation"; template: string; nom: string }> = [
    { piece: "attestation", template: "attestation_paiement_examen", nom: `Attestation_${vente.numero_attestation}.pdf` },
  ];
  if (vente.type_examen === "TEF_IRN") {
    rendus.push({ piece: "convocation", template: "convocation_examen_tef", nom: `Convocation_TEF_${candidat.nom}.pdf` });
  } else if (vente.type_examen === "Examen_civique") {
    rendus.push({ piece: "convocation", template: "convocation_examen_civique", nom: `Convocation_civique_${candidat.nom}.pdf` });
  }
  // Vente plateforme : attestation seule, JAMAIS de convocation (règle §2.2).

  for (const r of rendus) {
    const html = fusionExamen(r.template, valeurs);
    const { pdf } = await renderHtmlToPdf({ html, name: r.nom });
    const chemin = `examens/${vente.id}/${r.piece}_genere.pdf`;
    const { error } = await supabaseAdmin.storage
      .from("documents")
      .upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Archivage ${r.piece} : ${error.message}`);
    docs.push({ piece: r.piece, nomFichier: r.nom, pdf, chemin });
  }
  return docs;
}

/** Envoie au candidat l'email avec ses documents en pièces jointes. */
export async function envoyerDocumentsVente(
  vc: VenteComplete,
  docs: DocumentGenere[],
  options?: { corrigee?: boolean; messagePerso?: string | null },
): Promise<{ ok: boolean; erreur?: string }> {
  const { vente, candidat, session } = vc;
  if (!candidat.email) return { ok: false, erreur: "Candidat sans adresse email." };

  const estPlat = vente.type_examen === "Vente_plateforme";
  const prefixe = options?.corrigee ? "Mise à jour — remplace la version précédente · " : "";
  const objet = estPlat
    ? `${prefixe}Votre attestation d'inscription MYSTORY (${vente.numero_attestation})`
    : `${prefixe}Votre convocation à l'examen — ${session ? dateFR(session.date_examen) : ""} (${vente.numero_attestation})`;

  const lignesSession = session
    ? `<p><strong>Votre session :</strong> ${session.type === "TEF_IRN" ? "TEF IRN" : "Examen civique"} —
       le <strong>${dateFR(session.date_examen)}</strong> à <strong>${horaires(session).debut}</strong><br>
       Lieu : <strong>3 bis avenue de Gagny, 93220 Gagny</strong> (RER E station Gagny)</p>
       <p>Merci de vous présenter <strong>15 minutes avant</strong>, muni(e) d'une <strong>pièce d'identité en cours de validité</strong> et de votre convocation (imprimée ou sur téléphone).</p>`
    : `<p>Votre accès à l'application d'entraînement <strong>${vente.sous_type ?? ""}</strong> est confirmé.</p>`;

  const introCorrigee = options?.messagePerso && options.messagePerso.trim()
    ? escapeHtml(options.messagePerso.trim()).replace(/\n/g, "<br>")
    : "Suite à une correction, veuillez trouver la <strong>nouvelle version</strong> de vos documents — elle remplace la précédente.";
  const corps = `
    <p>Bonjour ${candidat.prenom ?? ""},</p>
    <p>${options?.corrigee ? introCorrigee : "Nous vous confirmons votre inscription. Vos documents sont joints à cet email."}</p>
    ${lignesSession}
    <p>N° d'attestation : <strong>${vente.numero_attestation}</strong> · Montant réglé : <strong>${vente.montant} €</strong>${Number(vente.reste_a_payer) > 0 ? ` · Reste à payer : <strong>${vente.reste_a_payer} €</strong>` : ""}</p>
    <p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
    <p>L'équipe MYSTORY</p>`;

  return envoyerEmail({
    a: candidat.email,
    objet,
    html: gabaritEmail(estPlat ? "Attestation d'inscription" : "Convocation à l'examen", corps),
    piecesJointes: docs.map((d) => ({ nom: d.nomFichier, contenu: d.pdf })),
    entite: "ventes_examen",
    entiteId: vente.id,
    auteur: vente.vendu_par ?? null,
  });
}

/**
 * Envoi GROUPÉ (Sens A3) : pour un même jour, un seul email avec la convocation
 * fusionnée (toutes les épreuves) et les attestations de chaque examen.
 */
export async function envoyerConvocationsGroupees(params: {
  candidat: any;
  dateExamenISO: string;
  examensDuJour: Array<{ vente: any; session: any }>;
  attestations: DocumentGenere[];
  convocationGroupee: { nom: string; pdf: Buffer };
}): Promise<{ ok: boolean; erreur?: string }> {
  const { candidat, dateExamenISO, examensDuJour, attestations, convocationGroupee } = params;
  if (!candidat.email) return { ok: false, erreur: "Candidat sans adresse email." };

  const lignes = examensDuJour
    .slice()
    .sort((a, b) => horaires(a.session).debut.localeCompare(horaires(b.session).debut))
    .map(({ vente, session }) => {
      const typeLabel = vente.type_examen === "TEF_IRN" ? "TEF IRN" : "Examen civique";
      const mention = vente.sous_type ? ` — ${escapeHtml(String(vente.sous_type))}` : "";
      return `<li><strong>${typeLabel}</strong>${mention} — à <strong>${escapeHtml(horaires(session).debut)}</strong> (n° ${escapeHtml(String(vente.numero_attestation))})</li>`;
    }).join("");

  const corps = `
    <p>Bonjour ${escapeHtml(candidat.prenom ?? "")},</p>
    <p>Nous vous confirmons votre inscription. Vous êtes convoqué(e) le <strong>${dateFR(dateExamenISO)}</strong> à MYSTORY (Gagny) pour les épreuves suivantes :</p>
    <ul>${lignes}</ul>
    <p>Lieu : <strong>3 bis avenue de Gagny, 93220 Gagny</strong> (RER E station Gagny).<br>
       Merci de vous présenter <strong>15 minutes avant la première épreuve</strong>, muni(e) d'une <strong>pièce d'identité en cours de validité</strong> et de votre convocation (imprimée ou sur téléphone).</p>
    <p>En pièces jointes : <strong>votre convocation regroupant toutes vos épreuves du jour</strong> et vos attestations.</p>
    <p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
    <p>L'équipe MYSTORY</p>`;

  return envoyerEmail({
    a: candidat.email,
    objet: `Vos convocations à l'examen — ${dateFR(dateExamenISO)} (${examensDuJour.length} épreuves) (${candidat.nom ?? ""})`,
    html: gabaritEmail("Convocations à l'examen", corps),
    piecesJointes: [
      { nom: convocationGroupee.nom, contenu: convocationGroupee.pdf },
      ...attestations.map((a) => ({ nom: a.nomFichier, contenu: a.pdf })),
    ],
    entite: "ventes_examen",
    entiteId: examensDuJour[0]?.vente?.id ?? null,
    auteur: examensDuJour[0]?.vente?.vendu_par ?? null,
  });
}

export async function journal(entite: string, entiteId: string | null, evenement: string, valeurs?: Record<string, unknown>, auteur?: string | null) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite, entite_id: entiteId, evenement,
      nouvelle_valeur: valeurs ?? null, auteur: auteur ?? null,
    });
  } catch { /* le journal ne bloque jamais le flux métier */ }
}
