"use client";
// app/examens/taux/page.tsx — Taux de réussite examen (indicateur de résultats Qualiopi).
import { useCallback, useEffect, useState } from "react";

type Agg = {
  inscrits: number; saisis: number; presents: number; absents: number;
  reussis: number; echoues: number; sansResultat: number;
  tauxPresentation: number | null; tauxReussite: number | null;
  niveaux: Record<string, number>;
};
type Data = {
  filtres: { certif: string; agence: string; debut: string | null; fin: string | null };
  agences: string[];
  global: Agg;
  parType: { TEF_IRN: Agg; CIVIQUE: Agg };
  parAgence: ({ agence: string } & Agg)[];
  niveauxTef: string[];
};

function pct(n: number | null): string { return n == null ? "—" : `${n} %`; }

function Kpi({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-mystory bg-mystory-clair" : "border-gray-200 bg-white"}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-mystory" : "text-gray-900"}`}>{valeur}</div>
    </div>
  );
}

function BlocTaux({ titre, a, niveauxTef }: { titre: string; a: Agg; niveauxTef: string[] }) {
  const maxN = Math.max(1, ...niveauxTef.map((n) => a.niveaux[n] ?? 0));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{titre}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Taux de présentation" valeur={pct(a.tauxPresentation)} accent />
        <Kpi label="Taux de réussite" valeur={pct(a.tauxReussite)} accent />
        <Kpi label="Présents / réussis" valeur={`${a.presents} / ${a.reussis}`} />
        <Kpi label="Absents / échoués" valeur={`${a.absents} / ${a.echoues}`} />
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {a.inscrits} inscrit(s) · {a.saisis} résultat(s) saisi(s){a.sansResultat ? ` · ${a.sansResultat} sans résultat` : ""}
      </p>
      {(a.niveaux.A1 + a.niveaux.A2 + a.niveaux.B1 + a.niveaux.B2) > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-1">Répartition des niveaux atteints (TEF IRN)</div>
          <div className="space-y-1">
            {niveauxTef.map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-gray-600">{n}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-mystory rounded-full" style={{ width: `${((a.niveaux[n] ?? 0) / maxN) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-gray-700">{a.niveaux[n] ?? 0}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">A1 carte de séjour · A2 pluriannuelle · B1 résident · B2 naturalisation</p>
        </div>
      )}
    </div>
  );
}

export default function PageTaux() {
  const [data, setData] = useState<Data | null>(null);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [certif, setCertif] = useState("tous");
  const [agence, setAgence] = useState("toutes");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const q = new URLSearchParams({ certif, agence });
      if (debut) q.set("debut", debut);
      if (fin) q.set("fin", fin);
      const r = await fetch(`/api/examens/taux?${q.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setData(j);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [certif, agence, debut, fin]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5">
        <h1 className="page-title">Taux de réussite examen</h1>
        <p className="text-sm text-gray-500 mt-0.5">Indicateur de résultats (audit Qualiopi). Présentation = présents / saisis · Réussite = réussis / présents.</p>
      </header>

      <div className="flex flex-wrap items-end gap-2 mb-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Certification</label>
          <select value={certif} onChange={(e) => setCertif(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="tous">Toutes</option>
            <option value="TEF_IRN">TEF IRN</option>
            <option value="CIVIQUE">Examen civique</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Agence</label>
          <select value={agence} onChange={(e) => setAgence(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="toutes">Toutes</option>
            {(data?.agences ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Du</label>
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Au</label>
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}
      {charge && !data ? (
        <p className="text-gray-500 text-sm">Chargement…</p>
      ) : data ? (
        <div className="space-y-4">
          <BlocTaux titre="Global" a={data.global} niveauxTef={data.niveauxTef} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BlocTaux titre="TEF IRN" a={data.parType.TEF_IRN} niveauxTef={data.niveauxTef} />
            <BlocTaux titre="Examen civique" a={data.parType.CIVIQUE} niveauxTef={data.niveauxTef} />
          </div>

          {data.parAgence.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Par agence</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 text-xs uppercase">
                      <th className="py-2 pr-3 font-medium">Agence</th>
                      <th className="py-2 px-3 font-medium">Inscrits</th>
                      <th className="py-2 px-3 font-medium">Présents</th>
                      <th className="py-2 px-3 font-medium">Réussis</th>
                      <th className="py-2 px-3 font-medium">Présentation</th>
                      <th className="py-2 px-3 font-medium">Réussite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parAgence.map((r) => (
                      <tr key={r.agence} className="border-t border-gray-100">
                        <td className="py-2 pr-3 text-gray-900">{r.agence}</td>
                        <td className="py-2 px-3 text-gray-600">{r.inscrits}</td>
                        <td className="py-2 px-3 text-gray-600">{r.presents}</td>
                        <td className="py-2 px-3 text-gray-600">{r.reussis}</td>
                        <td className="py-2 px-3 text-gray-700">{pct(r.tauxPresentation)}</td>
                        <td className="py-2 px-3 font-medium text-mystory">{pct(r.tauxReussite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">Les résultats se saisissent sur la page « Candidats examen » (et la saisie du jour pour les ventes).</p>
        </div>
      ) : null}
    </main>
  );
}
