"use client";
/**
 * MYSTORY — Porte d'entrée du TEST FINAL (testfinale.mystoryformation.fr).
 * Le test final est toujours rattaché au dossier de formation : on y accède par le lien
 * reçu par email, ou en saisissant le code remis par la formatrice — jamais en libre-service.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TestFinaleAccueil() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function ouvrir() {
    const c = code.trim();
    if (!c) { setErr("Saisissez le code remis par votre formatrice."); return; }
    router.push(`/test/${encodeURIComponent(c)}`);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-mystory">Test final de formation</h1>
      <p className="mt-3 text-sm text-gray-600">
        Ce test clôture votre parcours chez MYSTORY Formation : il mesure votre progression
        (compréhension et expression, écrites et orales) et alimente votre évaluation finale.
      </p>
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm">
        <p className="text-sm font-semibold text-gray-900">Comment accéder à mon test ?</p>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
          <li>📧 <strong>Par email</strong> : cliquez sur le lien « Passer mon test » reçu de contact@mystoryformation.fr.</li>
          <li>🏢 <strong>Sur place</strong> : votre formatrice lance le test sur la tablette du centre.</li>
          <li>🔑 <strong>Avec un code</strong> : saisissez ci-dessous le code remis par votre formatrice.</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <input value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }}
            onKeyDown={(e) => e.key === "Enter" && ouvrir()}
            placeholder="Code du test"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
          <button onClick={ouvrir} className="btn-primary">Commencer →</button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
      <p className="mt-5 text-xs text-gray-400">
        Une question ? 06 81 43 16 54 · contact@mystoryformation.fr — MYSTORY Formation, 3 bis av. de Gagny, 93220 Gagny.
      </p>
    </main>
  );
}
