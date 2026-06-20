"use client";

/**
 * MYSTORY — /classement : classement vendeur GLOBAL (examen + formation).
 * 3 vues (Global / Examen / Formation), CA + nombre de ventes par vendeur, filtre période.
 * Réservé à la Direction. Données calculées à la volée par /api/classement/global.
 */
import { useEffect, useState } from "react";

type Ligne = {
  vendeur: string; ventes: number; ca: number;
  ventesExamen?: number; caExamen?: number; ventesFormation?: number; caFormation?: number;
};

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const MEDAILLE = ["🥇", "🥈", "🥉"];

export default function PageClassement() {
  const [vue, setVue] = useState<"global" | "examen" | "formation">("global");
  const [periode, setPeriode] = useState<"mois" | "tout">("mois");
  const [data, setData] = useState<any>(null);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCharge(true); setErr(null);
    fetch(`/api/classement/global?periode=${periode}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else setErr(j.erreur ?? "Erreur"); })
      .catch(() => setErr("Erreur de chargement"))
      .finally(() => setCharge(false));
  }, [periode]);

  const lignes: Ligne[] = data?.[vue] ?? [];
  const total = data?.totaux?.[vue] ?? { ventes: 0, ca: 0 };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">🏆 Classement vendeurs</h1>
          <p className="page-subtitle">CA et nombre de ventes par vendeur — examen, formation et global.</p>
        </div>
      </header>

      <div className="mb-3 flex gap-1 border-b border-gray-200">
        {([["global", "Global"], ["examen", "Examen"], ["formation", "Formation"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setVue(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${vue === v ? "border-mystory text-mystory" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{l}</button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        {([["mois", "Ce mois-ci"], ["tout", "Depuis le début"]] as const).map(([p, l]) => (
          <button key={p} onClick={() => setPeriode(p)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${periode === p ? "border-mystory bg-mystory text-white" : "border-gray-300 bg-white text-gray-700 hover:border-mystory"}`}>{l}</button>
        ))}
      </div>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : lignes.length === 0 ? (
        <div className="empty-state">Aucune vente sur cette période.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Vendeur</th>
                <th className="text-right">Ventes</th>
                <th className="text-right">CA</th>
                {vue === "global" && <th className="hidden text-right text-xs sm:table-cell">dont examen / formation</th>}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.vendeur}>
                  <td className="text-center">{MEDAILLE[i] ?? i + 1}</td>
                  <td className="font-medium text-gray-900">{l.vendeur}</td>
                  <td className="text-right">{l.ventes}</td>
                  <td className="text-right font-semibold">{eur(l.ca)}</td>
                  {vue === "global" && (
                    <td className="hidden text-right text-xs text-gray-500 sm:table-cell">
                      {l.ventesExamen ?? 0} · {eur(l.caExamen ?? 0)} &nbsp;/&nbsp; {l.ventesFormation ?? 0} · {eur(l.caFormation ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td></td>
                <td>Total</td>
                <td className="text-right">{total.ventes}</td>
                <td className="text-right">{eur(total.ca)}</td>
                {vue === "global" && <td className="hidden sm:table-cell"></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Le vendeur d'une formation est le prénom saisi à l'inscription. Les ventes sans vendeur apparaissent en « (non attribué) ».
      </p>
    </main>
  );
}
