"use client";
/**
 * MYSTORY — /activite : tableau de bord ACTIVITÉ combiné (formations + examens).
 * Vue direction/propriétaire. Séparé du BPF légal. Source : ventes_formation + examens.
 */
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import PageContainer from "@/components/ui/PageContainer";
import { TrendingUp } from "lucide-react";

const BLEU = "#2F72DE";
const eur = (n: number) => (n ?? 0).toLocaleString("fr-FR") + " €";

type Activite = {
  ok: boolean; annee: number; debut: string; fin: string; granularite: "jour" | "mois";
  total: { ca: number; caFormation: number; caExamen: number; nbFormations: number; nbExamens: number; nbTotal: number };
  parCentre: { centre: string; formations: number; examens: number; ca: number; caFormation: number; caExamen: number }[];
  parPeriode: { cle: string; label: string; formations: number; examens: number; ca: number }[];
  parTypeExamen: { type: string; nb: number; ca: number }[];
  topFormules: { formule: string; nb: number; ca: number }[];
  erreur?: string;
};

type Mode = "jour" | "mois" | "annee" | "perso";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Kpi({ label, valeur, sous }: { label: string; valeur: string; sous?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{valeur}</div>
      {sous && <div className="mt-0.5 text-xs text-gray-400">{sous}</div>}
    </div>
  );
}

export default function ActivitePage() {
  const [mode, setMode] = useState<Mode>("annee");
  const [annee, setAnnee] = useState(2026);
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [data, setData] = useState<Activite | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Construit la requête selon le mode (dates calculées côté client, heure locale Paris).
  const query = (() => {
    const today = ymd(new Date());
    if (mode === "jour") return `debut=${today}&fin=${today}`;
    if (mode === "mois") return `debut=${today.slice(0, 8)}01&fin=${today}`;
    if (mode === "perso" && debut && fin) return `debut=${debut}&fin=${fin}`;
    return `annee=${annee}`; // année pleine (ou repli si période perso incomplète)
  })();

  useEffect(() => {
    let vivant = true;
    setChargement(true); setErreur(null);
    fetch(`/api/activite?${query}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; if (j?.ok) setData(j); else setErreur(j?.erreur || "Erreur de chargement."); })
      .catch(() => vivant && setErreur("Erreur réseau."))
      .finally(() => vivant && setChargement(false));
    return () => { vivant = false; };
  }, [query]);

  const maxMois = Math.max(1, ...(data?.parPeriode.map((m) => m.ca) ?? [1]));

  return (
    <PageContainer width="large">
      <PageHeader
        title="Activité"
        subtitle="Formations + examens réels — vue direction, distincte du BPF légal."
        icon={<TrendingUp size={22} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
              {([["jour", "Aujourd'hui"], ["mois", "Ce mois"], ["annee", "Année"], ["perso", "Période"]] as [Mode, string][]).map(([m, lbl]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-mystory text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {mode === "annee" && (
              <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
                {[2026, 2025, 2024].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {mode === "perso" && (
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
                <span>→</span>
                <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
              </span>
            )}
          </div>
        }
      />

      {chargement && <div className="py-16 text-center text-sm text-gray-400">Chargement…</div>}
      {erreur && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erreur}</div>}

      {data && !chargement && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="CA total" valeur={eur(data.total.ca)} sous={`${data.total.nbTotal} ventes · ${mode === "jour" ? "aujourd'hui" : mode === "mois" ? "ce mois-ci" : mode === "annee" ? annee : `${data.debut} → ${data.fin}`}`} />
            <Kpi label="CA formations" valeur={eur(data.total.caFormation)} sous={`${data.total.nbFormations} dossiers`} />
            <Kpi label="CA examens" valeur={eur(data.total.caExamen)} sous={`${data.total.nbExamens} candidats`} />
            <Kpi label="Panier moyen" valeur={eur(data.total.nbTotal ? Math.round(data.total.ca / data.total.nbTotal) : 0)} sous="par vente" />
          </div>

          {/* CA par période (jour ou mois selon la durée) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">CA par {data.granularite === "jour" ? "jour" : "mois"}</h2>
            {data.parPeriode.length === 0 ? (
              <div className="text-sm text-gray-400">Aucune donnée sur cette période.</div>
            ) : (
              <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: 160 }}>
                {data.parPeriode.map((p) => (
                  <div key={p.cle} className="flex min-w-[14px] flex-1 flex-col items-center justify-end gap-1">
                    <div className="text-[10px] font-medium text-gray-500">{Math.round(p.ca / 1000)}k</div>
                    <div className="w-full rounded-t-md transition-all"
                      style={{ height: `${Math.max(4, (p.ca / maxMois) * 120)}px`, background: BLEU }}
                      title={`${p.label} : ${eur(p.ca)} · ${p.formations} form. / ${p.examens} exam.`} />
                    {data.parPeriode.length <= 31 && <div className="whitespace-nowrap text-[9px] text-gray-400">{p.label}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Par centre */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Par centre</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2">Centre</th><th className="py-2 text-right">Formations</th>
                  <th className="py-2 text-right">Examens</th><th className="py-2 text-right">CA total</th>
                </tr>
              </thead>
              <tbody>
                {data.parCentre.map((c) => (
                  <tr key={c.centre} className="border-b border-gray-50">
                    <td className="py-2 font-medium text-gray-800">{c.centre}</td>
                    <td className="py-2 text-right text-gray-600">{c.formations} · {eur(c.caFormation)}</td>
                    <td className="py-2 text-right text-gray-600">{c.examens} · {eur(c.caExamen)}</td>
                    <td className="py-2 text-right font-semibold" style={{ color: BLEU }}>{eur(c.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2 colonnes : type examen + top formules */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Examens par type</h2>
              {data.parTypeExamen.length === 0 ? <div className="text-sm text-gray-400">—</div> : (
                <ul className="space-y-2">
                  {data.parTypeExamen.map((t) => (
                    <li key={t.type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{t.type}</span>
                      <span className="text-gray-500">{t.nb} · <b className="text-gray-800">{eur(t.ca)}</b></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Top formules (formation)</h2>
              {data.topFormules.length === 0 ? <div className="text-sm text-gray-400">—</div> : (
                <ul className="space-y-2">
                  {data.topFormules.map((f) => (
                    <li key={f.formule} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2 text-gray-700">{f.formule}</span>
                      <span className="whitespace-nowrap text-gray-500">{f.nb}× · <b className="text-gray-800">{eur(f.ca)}</b></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Source : ventes de formation (table <code>ventes_formation</code>) + examens (table <code>examens</code>), hors annulés/remboursés.
            Chiffres d'activité — distincts du BPF légal (formation uniquement).
          </p>
        </div>
      )}
    </PageContainer>
  );
}
