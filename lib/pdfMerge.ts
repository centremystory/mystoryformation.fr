/**
 * MYSTORY — fusion de PDF (pdf-lib).
 * Concatène plusieurs PDF en un seul, en conservant chaque document officiel intact
 * (une page par convocation). Utilisé par l'inscription croisée pour regrouper les
 * convocations d'un même jour en un seul fichier (Sens A3).
 */
import { PDFDocument } from "pdf-lib";

export async function fusionnerPdfs(pdfs: Buffer[]): Promise<Buffer> {
  if (pdfs.length === 0) throw new Error("Aucun PDF à fusionner.");
  if (pdfs.length === 1) return pdfs[0];
  const sortie = await PDFDocument.create();
  for (const buf of pdfs) {
    const src = await PDFDocument.load(buf);
    const pages = await sortie.copyPages(src, src.getPageIndices());
    pages.forEach((p) => sortie.addPage(p));
  }
  const bytes = await sortie.save();
  return Buffer.from(bytes);
}
