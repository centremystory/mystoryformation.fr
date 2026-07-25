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
const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Activite = {
  ok: boolean; annee: number;
  total: { ca: number; caFormation: number; caExamen: number; nbFormations: number; nbExamens: number; nbTotal: number };
  parCentre: { centre: string; formations: number; examens: number; ca: number; caFormation: number; caExamen: number }[];
  parMois: { mois: string; formations: number; examens: number; ca: number }[];
  parTypeExamen: { type: string; nb: number; ca: number }[];
  topFormules: { formule: string; nb: number; ca: number }[];
  erreur?: string;
};

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
  const [annee, setAnnee] = useState(2026);
  const [data, setData] = useState<Activite | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    setChargement(true); setErreur(null);
    fetch(`/api/activite?annee=${annee}`)
      .then((r) => r.json())
      .then((j) => { if (!vivant) return; if (j?.ok) setData(j); else setErreur(j?.erreur || "Erreur de chargement."); })
      .catch(() => vivant && setErreur("Erreur réseau."))
      .finally(() => vivant && setChargement(false));
    return () => { vivant = false; };
  }, [annee]);

  const maxMois = Math.max(1, ...(data?.parMois.map((m) => m.ca) ?? [1]));

  return (
    <PageContainer width="large">
      <PageHeader
        title="Activité"
        subtitle="Formations + examens réels — vue direction, distincte du BPF légal."
        icon={<TrendingUp size={22} />}
        actions={
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
            {[2026, 2025, 2024].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        }
      />

      {chargement && <div className="py-16 text-center text-sm text-gray-400">Chargement…</div>}
      {erreur && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erreur}</div>}

      {data && !chargement && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label={`CA total ${data.annee}`} valeur={eur(data.total.ca)} sous={`${data.total.nbTotal} ventes`} />
            <Kpi label="CA formations" valeur={eur(data.total.caFormation)} sous={`${data.total.nbFormations} dossiers`} />
            <Kpi label="CA examens" valeur={eur(data.total.caExamen)} sous={`${data.total.nbExamens} candidats`} />
            <Kpi label="Panier moyen" valeur={eur(data.total.nbTotal ? Math.round(data.total.ca / data.total.nbTotal) : 0)} sous="par vente" />
          </div>

          {/* CA par mois */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">CA par mois</h2>
            {data.parMois.length === 0 ? (
              <div className="text-sm text-gray-400">Aucune donnée pour {data.annee}.</div>
            ) : (
              <div className="flex items-end gap-2" style={{ height: 160 }}>
                {data.parMois.map((m) => {
                  const mm = Number(m.mois.slice(5, 7)) - 1;
                  return (
                    <div key={m.mois} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div className="text-[10px] font-medium text-gray-500">{Math.round(m.ca / 1000)}k</div>
                      <div className="w-full rounded-t-md transition-all"
                        style={{ height: `${Math.max(4, (m.ca / maxMois) * 120)}px`, background: BLEU }}
                        title={`${MOIS_FR[mm]} : ${eur(m.ca)} · ${m.formations} form. / ${m.examens} exam.`} />
                      <div className="text-[10px] text-gray-400">{MOIS_FR[mm]}</div>
                    </div>
                  );
                })}
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
