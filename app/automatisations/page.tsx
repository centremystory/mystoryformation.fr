"use client";
import { useEffect, useState } from "react";

type Exec = { id: string; workflowId: string; status: string; startedAt: string | null; stoppedAt: string | null; mode: string | null };
type Wf = { id: string; name: string; active: boolean; dernier: Exec | null; erreurs: number };

function dureeMs(a: string | null, b: string | null): string {
  if (!a || !b) return "—";
  const d = new Date(b).getTime() - new Date(a).getTime();
  if (!isFinite(d) || d < 0) return "—";
  return d < 1000 ? `${d} ms` : `${(d / 1000).toFixed(1)} s`;
}
function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
const BADGE: Record<string, string> = {
  success: "bg-green-100 text-green-800", error: "bg-red-100 text-red-800",
  crashed: "bg-red-100 text-red-800", running: "bg-blue-100 text-blue-800",
  waiting: "bg-amber-100 text-amber-800", canceled: "bg-gray-100 text-gray-600",
};
function Badge({ s }: { s: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[s] ?? "bg-gray-100 text-gray-600"}`}>{s}</span>;
}

export default function AutomatisationsPage() {
  const [wf, setWf] = useState<Wf[]>([]);
  const [erreurs, setErreurs] = useState<any[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<"actifs" | "inactifs" | "tous">("actifs");

  async function charger() {
    setChargement(true); setErreur(null);
    try {
      const r = await fetch("/api/automatisations");
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur ?? "Erreur de chargement.");
      setWf(j.workflows ?? []); setErreurs(j.erreursRecentes ?? []);
    } catch (e: any) { setErreur(e?.message ?? String(e)); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(); }, []);

  const nbActifs = wf.filter((w) => w.active).length;
  const nbInactifs = wf.length - nbActifs;
  const visibles = wf.filter((w) => (filtre === "tous" ? true : filtre === "actifs" ? w.active : !w.active));

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Automatisations (n8n)</h1>
        <button onClick={charger} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Rafraîchir</button>
      </div>
      <p className="text-sm text-gray-500 mt-1">Workflows, dernier passage et erreurs récentes — en lecture.</p>

      <div className="flex flex-wrap gap-2 mt-4">
        {([["actifs", `Actifs (${nbActifs})`], ["inactifs", `Inactifs (${nbInactifs})`], ["tous", `Tous (${wf.length})`]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filtre === v ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {erreur && <p className="mt-4 text-sm text-red-600">{erreur}</p>}
      {chargement ? (
        <p className="mt-6 text-sm text-gray-400">Chargement…</p>
      ) : (
        <>
          <div className="mt-5 space-y-2">
            {visibles.length === 0 && <p className="text-sm text-gray-400">Aucun workflow dans ce filtre.</p>}
            {visibles.map((w) => (
              <div key={w.id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${w.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{w.active ? "Actif" : "Inactif"}</span>
                  <span className="text-sm font-medium text-gray-800">{w.name}</span>
                  {w.erreurs > 0 && <span className="text-xs text-red-600">· {w.erreurs} erreur(s)</span>}
                  <span className="flex-1" />
                  {w.dernier ? <Badge s={w.dernier.status} /> : <span className="text-xs text-gray-400">jamais exécuté</span>}
                </div>
                {w.dernier && (
                  <p className="text-xs text-gray-500 mt-1">
                    Dernier passage : {dateFr(w.dernier.startedAt)} · durée {dureeMs(w.dernier.startedAt, w.dernier.stoppedAt)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {erreurs.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wide text-gray-400 mt-8 mb-2">Erreurs récentes</p>
              <div className="space-y-2">
                {erreurs.map((e: any) => (
                  <div key={e.id} className="border border-red-200 bg-red-50 rounded-xl p-3 text-sm flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-800">{e.workflowName}</span>
                    <span className="text-gray-500">· {dateFr(e.startedAt)}</span>
                    <Badge s={e.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
