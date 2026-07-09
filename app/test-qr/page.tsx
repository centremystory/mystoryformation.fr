"use client";
/**
 * MYSTORY — /test-qr : le test initial toujours à portée de main de l'équipe.
 * QR à faire scanner au comptoir, lien à copier (WhatsApp/SMS), affiche imprimable.
 * À mettre en favori sur tous les postes. Accessible via le bouton « Nouveau ».
 */
import { useState } from "react";

const LIEN = "https://test.mystoryformation.fr";
const LIEN_DIRECT = "https://crm.mystoryformation.fr/test";

export default function TestQrPage() {
  const [copie, setCopie] = useState<string | null>(null);

  async function copier(txt: string) {
    try { await navigator.clipboard.writeText(txt); setCopie(txt); setTimeout(() => setCopie(null), 2000); }
    catch { window.prompt("Copiez le lien :", txt); }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Test initial — QR &amp; lien</h1>
          <p className="page-subtitle">À faire scanner au comptoir ou à envoyer par WhatsApp/SMS. Mettez cette page en favori ⭐ sur tous les postes.</p>
        </div>
      </div>

      <section className="card flex flex-col items-center p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qr-test.png" alt="QR code du test initial" className="h-64 w-64 rounded-2xl border-4 border-mystory p-2" />
        <div className="mt-4 text-xl font-bold text-mystory">test.mystoryformation.fr</div>
        <p className="mt-1 text-sm text-gray-500">Le candidat scanne → il choisit « Sur place » (avec votre prénom) ou « À distance ».</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => copier(LIEN)} className="btn-primary">
            {copie === LIEN ? "✓ Copié !" : "📋 Copier le lien"}
          </button>
          <a href={LIEN} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Ouvrir le test ↗
          </a>
          <a href="/affiche-qr-test.pdf" target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            🖨 Affiche A4 à imprimer
          </a>
        </div>
      </section>

      <section className="card p-4 text-sm text-gray-600">
        <p className="mb-1 font-semibold text-gray-900">Bons réflexes</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Prospect au téléphone qui hésite sur son niveau ? Envoyez le lien par SMS/WhatsApp : <button onClick={() => copier(LIEN)} className="underline text-mystory">{LIEN.replace("https://", "")}</button></li>
          <li>Au comptoir : faites scanner le QR et choisissez « Sur place » avec votre prénom — le test vous sera rattaché.</li>
          <li>Après le test, il apparaît dans <a href="/tests/a-noter" className="underline text-mystory">Tests à noter</a> ; l&apos;email de résultats + conseils part automatiquement à la notation.</li>
          <li>Si la redirection du sous-domaine n&apos;est pas encore active, le lien de secours est : <button onClick={() => copier(LIEN_DIRECT)} className="underline text-mystory">{copie === LIEN_DIRECT ? "✓ copié" : LIEN_DIRECT.replace("https://", "")}</button></li>
        </ul>
      </section>
    </main>
  );
}
