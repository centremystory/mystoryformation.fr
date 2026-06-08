/**
 * MYSTORY — Rendu HTML → PDF (serveur)  (Brique 2A)
 * Utilise puppeteer-core + @sparticuz/chromium (compatible serverless Vercel).
 * Renvoie un Buffer PDF A4.
 */
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
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
