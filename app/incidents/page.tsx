"use client";
// app/incidents/page.tsx — Surveillance des échecs (emails, n8n, système).
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Incident = { id: string; source: string; titre: string; detail: string | null; resolu: boolean; cree_le: string };
const BADGE: Record<string, string> = { email: "badge-info", n8n: "bg-purple-100 text-purple-700", systeme: "badge-neutral" };

export default function PageIncidents() {
  const toast = useToast();
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
      await apiFetch("/api/incidents", { method: "PATCH", body: JSON.stringify({ id, resolu }) });
      toast.success(resolu ? "Incident marqué résolu." : "Incident rouvert.");
      await charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — réessayez.");
    } finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Incidents techniques</h1>
          <p className="page-subtitle">Échecs d'emails, de workflows n8n ou système — pour ne rien rater.</p>
        </div>
      </header>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTous(false)} className={`rounded-full border px-3 py-1.5 text-xs transition ${!tous ? "border-mystory bg-mystory text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>À résoudre</button>
        <button onClick={() => setTous(true)} className={`rounded-full border px-3 py-1.5 text-xs transition ${tous ? "border-mystory bg-mystory text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Tous</button>
      </div>

      {charge ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : incidents.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <CheckCircle2 size={28} strokeWidth={1.75} className="text-success-600" />
            <p className="text-sm font-medium text-gray-700">Aucun incident {tous ? "" : "à résoudre"}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div key={i.id} className={`card !p-4 ${i.resolu ? "opacity-70" : "border-warning-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${BADGE[i.source] ?? "badge-neutral"}`}>{i.source}</span>
                <span className="font-medium text-gray-900">{i.titre}</span>
                <span className="flex-1" />
                <span className="text-xs text-gray-400">{new Date(i.cree_le).toLocaleString("fr-FR")}</span>
              </div>
              {i.detail && <p className="mt-1.5 break-words text-sm text-gray-600">{i.detail}</p>}
              <div className="mt-2">
                {i.resolu
                  ? <button onClick={() => basculer(i.id, false)} disabled={busy === i.id} className="text-xs text-mystory underline disabled:opacity-50">Rouvrir</button>
                  : <button onClick={() => basculer(i.id, true)} disabled={busy === i.id} className="text-xs text-success-700 underline disabled:opacity-50">Marquer résolu</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
