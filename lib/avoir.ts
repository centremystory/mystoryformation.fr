/**
 * MYSTORY — lib/avoir.ts · PDF d'avoir (note de crédit) contre une facture.
 * Document comptable : numéro AV-YYYY-NNNNN (série unifiée), référence la facture d'origine,
 * « Fait à Gagny ». La facture reste immuable ; l'avoir vient en déduction.
 */
import { renderHtmlToPdf } from "@/lib/docuseal";

export type AvoirData = {
  numero: string;
  facture_numero: string;
  date_emission?: string | null; // ISO ; défaut = aujourd'hui (serveur)
  client?: string | null;
  designation?: string | null;
  montant: number;
  motif: string;
  serie?: string | null;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (n?: number | null) => `${Number(n ?? 0).toFixed(2)} €`;
function dateFR(iso?: string | null): string {
  const d = iso ? new Date(iso.length <= 10 ? iso + "T12:00:00" : iso) : new Date();
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(d);
}

export function htmlAvoir(a: AvoirData): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 16mm 22mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1c2433; font-size: 10pt; line-height: 1.45; margin: 0; }
  .brandbar { height: 5px; background: #2F72DE; border-radius: 3px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; }
  .org h1 { color: #2F72DE; font-size: 16pt; margin: 0 0 2px; letter-spacing: .5px; }
  .org .legal { font-size: 7.4pt; color: #5b6472; line-height: 1.35; }
  .doctype { text-align: right; }
  .doctype .tag { display: inline-block; background: #b42318; color: #fff; font-size: 8pt; padding: 4px 10px; border-radius: 3px; letter-spacing: 1px; font-weight: 700; }
  .doctype .ref { font-size: 8pt; color: #1c2433; margin-top: 6px; font-weight: 600; }
  .doctype .sub { font-size: 7.6pt; color: #5b6472; }
  h2.title { text-align: center; font-size: 13pt; margin: 18px 0 2px; }
  table.fields { width: 100%; border-collapse: collapse; font-size: 9.4pt; margin: 6px 0; }
  table.fields td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #eef1f6; }
  table.fields td.k { color: #5b6472; width: 32%; }
  table.fields td.v { font-weight: 600; }
  .montant-box { background: #fdf3f2; border: 1px solid #f3c9c4; border-radius: 6px; padding: 10px 14px; margin: 12px 0; text-align: right; }
  .montant-box .lbl { font-size: 8.6pt; color: #5b6472; }
  .montant-box .val { font-size: 16pt; font-weight: 800; color: #b42318; }
  .note { font-size: 8.8pt; color: #5b6472; margin: 10px 0; }
  .madeat { margin-top: 16px; font-size: 9.6pt; }
  .ofsign { margin-top: 10px; min-height: 84px; position: relative; }
  .ofsign .who { font-size: 8.6pt; font-weight: 700; color: #2F72DE; }
  .ofsign .sub { font-size: 7.6pt; color: #5b6472; }
  .cachet { position: absolute; right: 8px; top: 4px; width: 74px; height: 74px; border: 2px solid #2F72DE; border-radius: 50%; color: #2F72DE; font-size: 6pt; line-height: 1.25; text-align: center; display: flex; align-items: center; justify-content: center; transform: rotate(-9deg); opacity: .9; padding: 4px; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #e3e8f0; padding-top: 4px; font-size: 6.6pt; color: #7a8290; text-align: center; line-height: 1.3; }
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
      <span class="tag">AVOIR</span>
      <div class="ref">N° ${esc(a.numero)}</div>
      <div class="sub">Émis le ${dateFR(a.date_emission)}</div>
    </div>
  </header>

  <h2 class="title">Avoir sur facture ${esc(a.facture_numero)}</h2>

  <table class="fields">
    <tr><td class="k">Client</td><td class="v">${esc(a.client) || "—"}</td></tr>
    <tr><td class="k">Facture d'origine</td><td class="v">${esc(a.facture_numero)}</td></tr>
    ${a.designation ? `<tr><td class="k">Prestation</td><td class="v">${esc(a.designation)}</td></tr>` : ""}
    <tr><td class="k">Motif de l'avoir</td><td class="v">${esc(a.motif)}</td></tr>
  </table>

  <div class="montant-box">
    <div class="lbl">Montant de l'avoir</div>
    <div class="val">− ${eur(a.montant)}</div>
  </div>

  <p class="note">Le présent avoir vient en déduction de la facture <strong>${esc(a.facture_numero)}</strong>, qui demeure inchangée. Il constitue une note de crédit au bénéfice du client ci-dessus.</p>

  <p class="madeat">Fait à Gagny, le ${dateFR(a.date_emission)}</p>

  <div class="ofsign">
    <div class="who">Pour MYSTORY</div>
    <div class="sub">Arudhan NATKUNASINGAM, Président</div>
    <div class="cachet">MYSTORY<br>Gagny<br>NDA 11756521775</div>
  </div>
  </body></html>`;
}

export async function genererAvoirPdf(a: AvoirData): Promise<Buffer> {
  const { pdf } = await renderHtmlToPdf({ html: htmlAvoir(a), name: `Avoir_${a.numero}.pdf` });
  return pdf;
}
