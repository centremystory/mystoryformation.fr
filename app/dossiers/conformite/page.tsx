"use client";
// app/dossiers/conformite/page.tsx — Scanner de conformité EDOF/Qualiopi (vue d'ensemble des dossiers à risque).
import { useEffect, useState } from "react";

type Anomalie = { code: string; label: string; gravite: "haute" | "moyenne" };
type Risque = { dossierId: string; stagiaire: string; agence: string | null; certif: string; financement: string; anomalies: Anomalie[] };

const LIBELLE_CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

export default function PageConformite() {
  const [dossiers, setDossiers] = useState<Risque[]>([]);
  const [total, setTotal] = useState(0);
  const [hautes, setHautes] = useState(0);
  const [charge, setCharge] = useState(true);

  useEffect(() => {
    fetch("/api/dossiers/conformite-edof", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setDossiers(j.dossiers); setTotal(j.total); setHautes(j.anomalies_hautes); } })
      .finally(() => setCharge(false));
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <a href="/dossiers" className="text-mystory underline text-sm">← Suivi des dossiers</a>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-1">Scanner de conformité</h1>
      <p className="text-sm text-gray-500 mb-5">Les dossiers à corriger avant un contrôle EDOF / Qualiopi, les plus à risque en premier.</p>

      {charge ? <p className="text-gray-500 text-sm">Analyse en cours…</p> : total === 0 ? (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 text-sm text-green-800">✓ Aucun dossier à risque détecté. Tout est conforme.</div>
      ) : (
        <>
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-5 text-sm text-amber-900">
            <strong>{total}</strong> dossier(s) à corriger{hautes > 0 ? <> · <strong>{hautes}</strong> anomalie(s) critique(s)</> : null}.
          </div>
          <div className="space-y-3">
            {dossiers.map((d) => (
              <div key={d.dossierId} className="border border-gray-200 rounded-xl bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{d.stagiaire}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{LIBELLE_CERTIF[d.certif] ?? d.certif}</span>
                  {d.agence && <span className="text-xs text-gray-400">{d.agence}</span>}
                  <span className="flex-1" />
                  <a href={`/dossiers/edof?dossier=${d.dossierId}`} className="text-mystory underline text-xs">🪪 Fiche EDOF</a>
                </div>
                <ul className="space-y-1 text-sm">
                  {d.anomalies.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={a.gravite === "haute" ? "text-red-600" : "text-amber-600"}>{a.gravite === "haute" ? "●" : "○"}</span>
                      <span className="text-gray-700">{a.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
