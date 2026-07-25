/**
 * MYSTORY — Rendu HTML → PDF (serveur)  (Brique 2A)
 * puppeteer-core + @sparticuz/chromium (paquet complet : binaire + librairies système
 * embarqués → pas de téléchargement distant, plus fiable en serverless Vercel).
 * Chrome 138 : version dont les libs système sont compatibles avec le runtime
 * Vercel actuel (Amazon Linux 2023) — la v131 échouait en `libnss3.so introuvable`.
 * Renvoie un Buffer PDF A4.
 */
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// Un PDF n'a besoin ni de WebGL ni de la pile graphique → on la coupe.
// Moins de librairies système à charger = démarrage plus rapide et plus fiable.
chromium.setGraphicsMode = false;

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
