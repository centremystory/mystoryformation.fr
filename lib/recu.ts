/**
 * MYSTORY — lib/recu.ts  ·  Reçu de paiement (justificatif NON comptable).
 *
 * IMPORTANT (conformité) :
 *  · Document COURTOISIE : il ne consomme AUCUN numéro de la série MYS-2026
 *    (ni attestation, ni facture) → zéro impact sur la séquence seq_attestation_examen.
 *  · Ce n'est PAS une facture. La facture (numérotée, immuable) reste le document
 *    comptable ; le reçu y renvoie si elle existe.
 *  · « Fait à Gagny » en dur (site unique de conformité).
 */
import { renderHtmlToPdf } from "@/lib/docuseal";

export type RecuPaiement = {
  civilite?: string | null;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  type_label?: string | null;      // « TEF IRN », « Examen civique », « Application »…
  sous_type?: string | null;
  date_examen?: string | null;     // ISO yyyy-mm-dd (facultatif)
  montant?: number | null;
  mode_paiement?: string | null;
  statut_paiement?: string | null;
  reste_a_payer?: number | null;
  numero_attestation?: string | null;
  numero_facture?: string | null;
  date_paiement?: string | null;   // ISO (date d'inscription/règlement, facultatif)
  agence?: string | null;
  referent?: string | null;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function dateFR(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function aujourdHuiFR(): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}
const eur = (n?: number | null) => `${Math.round(Number(n ?? 0))} €`;

/** HTML auto-porté du reçu (mêmes codes graphiques que l'attestation MYSTORY). */
export function htmlRecuPaiement(r: RecuPaiement): string {
  const nomComplet = [r.civilite, r.prenom, r.nom].map((x) => esc(x)).filter(Boolean).join(" ") || "—";
  const reste = Number(r.reste_a_payer ?? 0);
  const objet = [esc(r.type_label), r.sous_type ? esc(r.sous_type) : ""].filter(Boolean).join(" — ") || "Prestation d'examen";
  const refFacture = r.numero_facture
    ? `Ce reçu confirme le paiement reçu par notre centre. La facture <strong>${esc(r.numero_facture)}</strong> constitue le document comptable de référence.`
    : `Ce reçu confirme le paiement reçu par notre centre. Il ne constitue pas une facture.`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 16mm 22mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1c2433; font-size: 10pt; line-height: 1.45; margin: 0; }
  .brandbar { height: 5px; background: #2F72DE; border-radius: 3px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; }
  .org h1 { color: #2F72DE; font-size: 16pt; margin: 0 0 2px; letter-spacing: .5px; }
  .org .legal { font-size: 7.4pt; color: #5b6472; line-height: 1.35; }
  .doctype { text-align: right; }
  .doctype .tag { display: inline-block; background: #2F72DE; color: #fff; font-size: 7.4pt; padding: 3px 8px; border-radius: 3px; letter-spacing: .5px; }
  .doctype .ref { font-size: 7.6pt; color: #5b6472; margin-top: 6px; }
  h2.title { text-align: center; font-size: 14pt; margin: 18px 0 4px; }
  table.fields { width: 100%; border-collapse: collapse; font-size: 9.4pt; margin: 4px 0; }
  table.fields td { padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #eef1f6; }
  table.fields td.k { color: #5b6472; width: 34%; }
  table.fields td.v { font-weight: 600; }
  h3 { color: #2F72DE; font-size: 9.8pt; margin: 14px 0 4px; border-bottom: 1px solid #e3e8f0; padding-bottom: 2px; }
  .reglement { background: #f3f7fe; border: 1px solid #d8e4fb; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 10pt; }
  .reglement .montant { font-size: 13pt; font-weight: 700; color: #2F72DE; }
  .note { font-size: 8.8pt; color: #5b6472; margin: 8px 0; }
  .madeat { margin-top: 16px; font-size: 9.6pt; }
  .ofsign { margin-top: 10px; min-height: 86px; position: relative; }
  .ofsign .who { font-size: 8.6pt; font-weight: 700; color: #2F72DE; }
  .ofsign .sub { font-size: 7.6pt; color: #5b6472; }
  .cachet { position: absolute; right: 8px; top: 4px; width: 74px; height: 74px; border: 2px solid #2F72DE; border-radius: 50%; color: #2F72DE; font-size: 6pt; line-height: 1.25; text-align: center; display: flex; align-items: center; justify-content: center; transform: rotate(-9deg); opacity: .9; padding: 4px; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #e3e8f0; padding-top: 4px; font-size: 6.6pt; color: #7a8290; text-align: center; line-height: 1.3; }
  .rgpd { margin-top: 12px; font-size: 7.4pt; color: #5b6472; border-top: 1px solid #e3e8f0; padding-top: 6px; }
  </style></head><body>
  <footer>
    MYSTORY — SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017 · Déclaration d'activité n° 11756521775 (ne vaut pas agrément de l'État)<br>
    Gagny : 3 bis av. de Gagny, 93220 · Sarcelles : 18 av. du 8 Mai 1945, 95200 · Rosny : 46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois · 06 81 43 16 54 · contact@mystoryformation.fr
  </footer>

  <div class="brandbar"></div>
  <header>
    <div class="org">
      <h1>MYSTORY</h1>
      <div class="legal">SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017<br>Déclaration d'activité n° 11756521775<br>06 81 43 16 54 · contact@mystoryformation.fr</div>
    </div>
    <div class="doctype">
      <span class="tag">REÇU DE PAIEMENT</span>
      <div class="ref">Émis le ${aujourdHuiFR()}</div>
    </div>
  </header>

  <h2 class="title">Reçu de paiement</h2>
  <p style="text-align:center; font-size:8.6pt; color:#5b6472; margin-top:-2px;"><em>Centre d'examen · TEF IRN / Examen civique</em></p>

  <table class="fields">
    <tr><td class="k">Candidat</td><td class="v">${nomComplet}</td></tr>
    <tr><td class="k">Téléphone</td><td class="v">${esc(r.telephone) || "—"}</td></tr>
    <tr><td class="k">Email</td><td class="v">${esc(r.email) || "—"}</td></tr>
    <tr><td class="k">Prestation</td><td class="v">${objet}</td></tr>
    ${r.date_examen ? `<tr><td class="k">Session d'examen</td><td class="v">${dateFR(r.date_examen)} — Gagny (3 bis av. de Gagny, 93220)</td></tr>` : ""}
    ${r.numero_attestation ? `<tr><td class="k">N° d'attestation</td><td class="v">${esc(r.numero_attestation)}</td></tr>` : ""}
    ${r.numero_facture ? `<tr><td class="k">Facture liée</td><td class="v">${esc(r.numero_facture)}</td></tr>` : ""}
  </table>

  <h3>Règlement</h3>
  <div class="reglement">
    <span class="montant">${eur(r.montant)}</span> réglés${r.mode_paiement ? ` · mode : <strong>${esc(r.mode_paiement)}</strong>` : ""}${r.statut_paiement ? ` · statut : <strong>${esc(r.statut_paiement)}</strong>` : ""}
    ${reste > 0 ? `<br><span style="color:#b42318; font-weight:700;">Reste à payer : ${eur(reste)}</span>` : `<br><span style="color:#067647; font-weight:700;">Soldé</span>`}
    ${r.date_paiement ? `<br><span style="font-size:8.6pt; color:#5b6472;">Date de règlement : ${dateFR(r.date_paiement)}</span>` : ""}
  </div>

  <p class="note">${refFacture}</p>

  <p class="madeat">Fait à Gagny, le ${aujourdHuiFR()}${r.referent ? ` — Référent : ${esc(r.referent)}` : ""}</p>

  <div class="ofsign">
    <div class="who">Pour MYSTORY</div>
    <div class="sub">Arudhan NATKUNASINGAM, Président</div>
    <div class="cachet">MYSTORY<br>Gagny<br>NDA 11756521775</div>
  </div>

  <p class="rgpd"><strong>Données personnelles (RGPD).</strong> Données traitées par MYSTORY (SASU) pour le suivi des inscriptions et les obligations liées au financement. Conservation : 5 ans. Droits d'accès, rectification, effacement, opposition : contact@mystoryformation.fr — réclamation possible auprès de la CNIL (www.cnil.fr).</p>
  </body></html>`;
}

/** Rend le reçu en PDF (aucun numéro consommé). */
export async function genererRecuPaiementPdf(r: RecuPaiement): Promise<Buffer> {
  const html = htmlRecuPaiement(r);
  const nom = `Recu_paiement_${(r.nom ?? "candidat").replace(/[^A-Za-z0-9]/g, "_")}.pdf`;
  const { pdf } = await renderHtmlToPdf({ html, name: nom });
  return pdf;
}
