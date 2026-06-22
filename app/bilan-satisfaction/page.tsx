"use client";

import { useCallback, useEffect, useState } from "react";

type Critere = { cle: string; label: string; moyenne: number | null; pctSatisfaits: number | null; n: number };
type Bilan = {
  type: string; n: number; nps: number | null; npsRepondants: number;
  globaleSur5: number | null; criteres: Critere[]; verbatims: { texte: string; date: string }[];
};

function frDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BilanSatisfactionPage() {
  const [type, setType] = useState<"chaud" | "froid">("chaud");
  const [depuis, setDepuis] = useState(""); const [jusqu, setJusqu] = useState("");
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const qs = new URLSearchParams({ type });
    if (depuis) qs.set("depuis", depuis);
    if (jusqu) qs.set("jusqu", jusqu);
    const r = await fetch(`/api/satisfaction/bilan?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    setBilan(j.ok ? j : null);
    setChargement(false);
  }, [type, depuis, jusqu]);
  useEffect(() => { charger(); }, [charger]);

  const npsCouleur = (v: number) => (v >= 50 ? "text-green-600" : v >= 0 ? "text-amber-600" : "text-red-600");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Bilan de satisfaction</h1>
        <p className="page-subtitle">Exploitation des retours stagiaires (démarche qualité). Moyennes, recommandation et verbatims.</p>
      </div>

      <div className="card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          <button onClick={() => setType("chaud")} className={`rounded px-3 py-1 ${type === "chaud" ? "bg-mystory text-white" : "text-gray-600"}`}>À chaud</button>
          <button onClick={() => setType("froid")} className={`rounded px-3 py-1 ${type === "froid" ? "bg-mystory text-white" : "text-gray-600"}`}>À froid (3 mois)</button>
        </div>
        <label className="text-sm">
          <span className="text-gray-600">Du</span>
          <input type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} className="input mt-1 block" />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Au</span>
          <input type="date" value={jusqu} onChange={(e) => setJusqu(e.target.value)} className="input mt-1 block" />
        </label>
        {(depuis || jusqu) && <button onClick={() => { setDepuis(""); setJusqu(""); }} className="btn-ghost text-sm">Tout</button>}
      </div>

      {chargement && <p className="text-sm text-gray-400">Calcul du bilan…</p>}

      {!chargement && bilan && bilan.n === 0 && (
        <div className="empty-state">Aucune réponse {type === "chaud" ? "à chaud" : "à froid"} sur cette période.</div>
      )}

      {!chargement && bilan && bilan.n > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="kpi"><div className="kpi-label">Répondants</div><div className="kpi-value">{bilan.n}</div></div>
            <div className="kpi">
              <div className="kpi-label">Satisfaction</div>
              <div className="kpi-value">{bilan.globaleSur5 != null ? `${bilan.globaleSur5.toFixed(1)}/5` : "—"}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Recommandation (NPS)</div>
              <div className={`kpi-value ${bilan.nps != null ? npsCouleur(bilan.nps) : ""}`}>{bilan.nps != null ? bilan.nps : "—"}</div>
            </div>
          </div>

          <div className="card p-4 mb-5">
            <p className="mb-3 text-sm font-medium text-gray-700">Moyenne par critère (sur 5)</p>
            <div className="space-y-3">
              {bilan.criteres.map((c) => (
                <div key={c.cle}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{c.label}</span>
                    <span className="text-gray-500">
                      {c.moyenne != null ? `${c.moyenne.toFixed(1)}/5` : "—"}
                      {c.pctSatisfaits != null && <span className="ml-2 text-xs text-gray-400">{c.pctSatisfaits}% satisfaits</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-mystory" style={{ width: `${c.moyenne != null ? (c.moyenne / 5) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {bilan.verbatims.length > 0 && (
            <div className="card p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Commentaires ({bilan.verbatims.length})</p>
              <div className="space-y-2">
                {bilan.verbatims.map((v, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm text-gray-700">
                    <span className="text-gray-400 text-xs mr-2">{frDate(v.date)}</span>{v.texte}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
