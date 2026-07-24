"use client";
/**
 * MYSTORY — Porte d'entrée du TEST FINAL (test.mystoryformation.fr / testfinale.mystoryformation.fr).
 * Le test final est toujours rattaché au dossier de formation : accès par lien email ou code
 * remis par la formatrice — jamais en libre-service. Layout de marque : app/test/layout.tsx.
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
    <div className="mt-4">
      <div className="text-center">
        <span className="inline-block rounded-full bg-mystory/10 px-3 py-1 text-xs font-semibold text-mystory">Fin de parcours</span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">Votre test final</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-600">
          Ce test clôture votre parcours chez MYSTORY Formation. Il mesure votre progression
          (compréhension et expression, écrites et orales) et alimente votre évaluation finale.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/70 px-6 py-4">
          <p className="text-sm font-semibold text-gray-900">Comment accéder à mon test&nbsp;?</p>
        </div>
        <ul className="divide-y divide-gray-100">
          <li className="flex items-start gap-3 px-6 py-4">
            <span className="text-xl">📧</span>
            <span className="text-sm text-gray-700"><strong>Par email</strong> — cliquez sur le lien «&nbsp;Passer mon test&nbsp;» reçu de contact@mystoryformation.fr.</span>
          </li>
          <li className="flex items-start gap-3 px-6 py-4">
            <span className="text-xl">🏢</span>
            <span className="text-sm text-gray-700"><strong>Sur place</strong> — votre formatrice lance le test sur la tablette du centre.</span>
          </li>
          <li className="flex items-start gap-3 px-6 py-4">
            <span className="text-xl">🔑</span>
            <span className="text-sm text-gray-700"><strong>Avec un code</strong> — saisissez ci-dessous le code remis par votre formatrice.</span>
          </li>
        </ul>
        <div className="border-t border-gray-100 px-6 py-5">
          <label className="mb-1.5 block text-xs font-medium text-gray-500">Code du test</label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(null); }}
              onKeyDown={(e) => e.key === "Enter" && ouvrir()}
              placeholder="Ex. ABCD-1234"
              className="flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-mystory focus:ring-2 focus:ring-mystory/20"
            />
            <button onClick={ouvrir} className="rounded-lg bg-mystory px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-mystory-fonce">
              Commencer →
            </button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-gray-400">
        Une question&nbsp;? 06 81 43 16 54 · contact@mystoryformation.fr
      </p>
    </div>
  );
}
