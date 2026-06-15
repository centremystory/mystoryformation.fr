"use client";
// app/incidents/page.tsx — Surveillance des échecs (emails, n8n, système).
import { useCallback, useEffect, useState } from "react";

type Incident = { id: string; source: string; titre: string; detail: string | null; resolu: boolean; cree_le: string };
const BADGE: Record<string, string> = { email: "bg-blue-100 text-blue-700", n8n: "bg-purple-100 text-purple-700", systeme: "bg-gray-100 text-gray-600" };

export default function PageIncidents() {
  const [tous, setTous] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const r = await fetch(`/api/incidents${tous ? "?tous=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setIncidents(j.incidents);
    } finally { setCharge(false); }
  }, [tous]);
  useEffect(() => { charger(); }, [charger]);

  async function basculer(id: string, resolu: boolean) {
    setBusy(id);
    try {
      await fetch("/api/incidents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, resolu }) });
      await charger();
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents techniques</h1>
          <p className="text-sm text-gray-500 mt-0.5">Échecs d'emails, de workflows n8n ou système — pour ne rien rater.</p>
        </div>
      </header>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTous(false)} className={`text-xs px-3 py-1.5 rounded-full border ${!tous ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-600"}`}>À résoudre</button>
        <button onClick={() => setTous(true)} className={`text-xs px-3 py-1.5 rounded-full border ${tous ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-600"}`}>Tous</button>
      </div>

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : incidents.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Aucun incident {tous ? "" : "à résoudre"} ✅</div>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div key={i.id} className={`border rounded-xl bg-white p-4 ${i.resolu ? "border-gray-200 opacity-70" : "border-amber-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[i.source] ?? "bg-gray-100 text-gray-600"}`}>{i.source}</span>
                <span className="font-medium text-gray-900">{i.titre}</span>
                <span className="flex-1" />
                <span className="text-xs text-gray-400">{new Date(i.cree_le).toLocaleString("fr-FR")}</span>
              </div>
              {i.detail && <p className="text-sm text-gray-600 mt-1.5 break-words">{i.detail}</p>}
              <div className="mt-2">
                {i.resolu
                  ? <button onClick={() => basculer(i.id, false)} disabled={busy === i.id} className="text-xs text-blue-600 underline disabled:opacity-50">Rouvrir</button>
                  : <button onClick={() => basculer(i.id, true)} disabled={busy === i.id} className="text-xs text-green-700 underline disabled:opacity-50">Marquer résolu</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
