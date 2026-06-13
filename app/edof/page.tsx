"use client";

/**
 * MYSTORY — Import EDOF (§7). Upload du CSV → analyse à blanc (dry-run) → application.
 * Sens unique EDOF→CRM. Aucune écriture tant que l'utilisateur n'a pas confirmé « Appliquer ».
 */
import { useState } from "react";

type Rapport = {
  total: number; crees: number; mis_a_jour: number; rapproches_live: number;
  conflits: Array<{ numero: string; champ: string; crm: string; edof: string }>;
  conflits_total: number;
  par_annee: Record<string, { dossiers: number; montant_facturable: number }>;
  par_statut: Record<string, number>;
  ignorees: number;
};

function eur(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }

export default function ImportEdof() {
  const [fichier, setFichier] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [applique, setApplique] = useState(false);
  const [busy, setBusy] = useState<"" | "dry" | "apply">("");
  const [erreur, setErreur] = useState<string | null>(null);

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErreur(null); setRapport(null); setApplique(false);
    setFichier(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.onerror = () => setErreur("Lecture du fichier impossible.");
    reader.readAsText(f, "utf-8");
  }

  async function envoyer(mode: "dry_run" | "apply") {
    if (!csv) return;
    setBusy(mode === "apply" ? "apply" : "dry"); setErreur(null);
    try {
      const r = await fetch("/api/edof/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode, fichier }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Échec."); return; }
      setRapport(j.rapport);
      if (mode === "apply") setApplique(true);
    } catch { setErreur("Échec de la requête."); }
    finally { setBusy(""); }
  }

  const annees = rapport ? Object.keys(rapport.par_annee).sort() : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">📥 Import EDOF</h1>
      <p className="mt-1 text-sm text-gray-500">
        Réconciliation <b>EDOF → CRM</b> (sens unique). Le CRM reste la source de vérité : on complète les champs vides,
        on signale les écarts, on n'écrase jamais. L'historique est archivé hors du flux Qualiopi vivant.
      </p>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <label className="block text-sm font-medium text-gray-700">Fichier export EDOF (<code>Export_&lt;SIRET&gt;_&lt;date&gt;.csv</code>)</label>
        <input type="file" accept=".csv,text/csv" onChange={choisir}
               className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-mystory file:px-4 file:py-2 file:text-white" />
        {fichier && <p className="mt-2 text-xs text-gray-500">Sélectionné : {fichier}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => envoyer("dry_run")} disabled={!csv || busy !== ""}
            className="rounded-xl bg-mystory px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "dry" ? "Analyse…" : "Analyser (sans rien écrire)"}
          </button>
          {rapport && !applique && (
            <button onClick={() => envoyer("apply")} disabled={busy !== ""}
              className="rounded-xl border-2 border-mystory px-4 py-2 text-sm font-semibold text-mystory disabled:opacity-50">
              {busy === "apply" ? "Application…" : `Appliquer l'import (${rapport.total} lignes)`}
            </button>
          )}
        </div>
        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
      </div>

      {rapport && (
        <div className="mt-6">
          {applique && (
            <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              ✅ Import appliqué — {rapport.total} dossiers EDOF synchronisés dans le CRM.
            </div>
          )}
          {!applique && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Analyse à blanc — <b>aucune écriture</b> pour l'instant. Vérifie puis clique « Appliquer ».
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Total lignes", rapport.total, "text-gray-900"],
              ["À créer", rapport.crees, "text-mystory"],
              ["Mises à jour", rapport.mis_a_jour, "text-gray-900"],
              ["Conflits", rapport.conflits_total, rapport.conflits_total ? "text-amber-600" : "text-gray-900"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500">{l}</div>
                <div className={`mt-1 text-2xl font-bold ${c}`}>{v as number}</div>
              </div>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-semibold text-gray-800">Répartition par année</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="border-b py-2">Année</th><th className="border-b py-2 text-right">Dossiers</th>
              <th className="border-b py-2 text-right">Montant facturable</th>
            </tr></thead>
            <tbody>
              {annees.map((a) => (
                <tr key={a}>
                  <td className="border-b py-2">{a}{a === "2025" ? " (N-1 BPF)" : ""}</td>
                  <td className="border-b py-2 text-right">{rapport.par_annee[a].dossiers}</td>
                  <td className="border-b py-2 text-right">{eur(rapport.par_annee[a].montant_facturable)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-6 text-sm font-semibold text-gray-800">Par statut</h2>
          <ul className="mt-2 text-sm text-gray-700">
            {Object.entries(rapport.par_statut).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
              <li key={s}>{n} · {s}</li>
            ))}
          </ul>

          {rapport.rapproches_live > 0 && (
            <p className="mt-4 text-sm text-gray-700">{rapport.rapproches_live} dossier(s) rapproché(s) à un dossier vivant.</p>
          )}
          {rapport.conflits_total > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-amber-700">Écarts à arbitrer (non écrasés)</h2>
              <ul className="mt-2 text-xs text-gray-600">
                {rapport.conflits.slice(0, 20).map((c, i) => (
                  <li key={i}>n° {c.numero} · {c.champ} : CRM « {c.crm} » ≠ EDOF « {c.edof} »</li>
                ))}
              </ul>
            </div>
          )}
          {rapport.ignorees > 0 && <p className="mt-3 text-xs text-gray-400">{rapport.ignorees} ligne(s) ignorée(s) (sans n° de dossier).</p>}
        </div>
      )}
    </main>
  );
}
