"use client";
// app/livret/[id]/page.tsx — Saisie digitale du livret de suivi (formatrice).
// Ne saisit QUE les champs formatrice ; le reste (couverture, positionnement, séances,
// résultats auto) est pré-rempli à la génération du PDF. Cases/menus, zéro texte inutile.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BookMarked, Save, FileText } from "lucide-react";

type D = any;
const EPR = [["ce", "CE"], ["co", "CO"], ["ee", "EE"], ["eo", "EO"]] as const;

export default function LivretSaisie() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<D>({ evals: [], blancs: [], remed: {}, jourJ: {}, res: {}, bilan: {}, seances: {} });
  const [seancesList, setSeancesList] = useState<Array<{ date_seance: string; demi_journee: string }>>([]);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/livret-suivi?dossier=${id}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.ok) { setD({ evals: [], blancs: [], remed: {}, jourJ: {}, res: {}, bilan: {}, seances: {}, ...(j.donnees ?? {}) }); setSeancesList(j.seances ?? []); } })
      .finally(() => setChargement(false));
  }, [id]);

  const arr = (key: "evals" | "blancs", i: number, field: string, v: any) =>
    setD((p: D) => { const a = [...(p[key] ?? [])]; a[i] = { ...(a[i] ?? {}), [field]: v }; return { ...p, [key]: a }; });
  const seance = (label: string, field: string, v: any) =>
    setD((p: D) => ({ ...p, seances: { ...(p.seances ?? {}), [label]: { ...((p.seances ?? {})[label] ?? {}), [field]: v } } }));
  const obj = (key: "remed" | "jourJ" | "res" | "bilan", field: string, v: any) =>
    setD((p: D) => ({ ...p, [key]: { ...(p[key] ?? {}), [field]: v } }));
  const top = (key: string, v: any) => setD((p: D) => ({ ...p, [key]: v }));

  const save = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await fetch("/api/livret-suivi", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: id, donnees: d }),
      }).then((r) => r.json());
      setMsg(j.ok ? "✅ Livret enregistré." : (j.erreur || "Échec."));
    } finally { setBusy(false); }
  }, [id, d]);

  if (chargement) return <main className="mx-auto max-w-4xl px-4 py-8"><p className="text-sm text-gray-400">Chargement…</p></main>;

  const inp = "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white";
  const th = "px-2 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50 border-b";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce"><BookMarked size={22} /></div>
          <div>
            <h1 className="page-title text-2xl">Livret de suivi — saisie</h1>
            <p className="page-subtitle">Complète les évaluations, examens blancs et le bilan. Le reste (couverture, positionnement, séances, résultats) est repris automatiquement.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/api/documents/livret-suivi?dossier=${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-mystory px-3 py-2 text-sm font-semibold text-mystory hover:bg-mystory-clair"><FileText size={16} /> Voir le PDF</a>
          <button onClick={save} disabled={busy} className="btn-primary"><Save size={16} /> {busy ? "…" : "Enregistrer"}</button>
        </div>
      </header>

      {msg && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      <Link href="/dossiers" className="mb-4 inline-block text-xs text-mystory underline">← Retour aux dossiers</Link>

      {/* Séances */}
      <section className="card mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Séances — ce que j'ai travaillé</h2>
        <p className="mb-2 text-xs text-gray-500">Dates et émargement repris du planning. Complète le contenu et la production (facultatif).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>N°</th><th className={th}>Date</th><th className={th}>Ce que j'ai travaillé</th><th className={th}>Production du jour</th></tr></thead>
            <tbody>
              {seancesList.map((s, i) => { const label = String(i + 1); return (
                <tr key={i}>
                  <td className="px-2 py-1 text-center text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-gray-600">{s.date_seance?.split("-").reverse().join("/")} · {s.demi_journee === "matin" ? "Matin" : "Après-midi"}</td>
                  <td className="px-2 py-1"><input className={inp} value={d.seances?.[label]?.t ?? ""} onChange={(e) => seance(label, "t", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className={inp} value={d.seances?.[label]?.p ?? ""} onChange={(e) => seance(label, "p", e.target.value)} /></td>
                </tr>
              ); })}
              {["R/C 1", "R/C 2", "R/C 3", "R/C 4"].map((label) => (
                <tr key={label}>
                  <td className="px-2 py-1 text-center text-gray-400">{label}</td>
                  <td className="px-2 py-1 text-gray-300">—</td>
                  <td className="px-2 py-1"><input className={inp} value={d.seances?.[label]?.t ?? ""} onChange={(e) => seance(label, "t", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className={inp} value={d.seances?.[label]?.p ?? ""} onChange={(e) => seance(label, "p", e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Examens blancs */}
      <section className="card mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Examens blancs (scores /699)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>N°</th><th className={th}>Date</th>{EPR.map(([k, l]) => <th key={k} className={th}>{l}</th>)}<th className={th}>Niveau projeté</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-center text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1"><input type="date" className={inp} value={d.blancs?.[i]?.date ?? ""} onChange={(e) => arr("blancs", i, "date", e.target.value)} /></td>
                  {EPR.map(([k]) => <td key={k} className="px-1 py-1"><input type="number" min={0} max={699} className={inp} value={d.blancs?.[i]?.[k] ?? ""} onChange={(e) => arr("blancs", i, k, e.target.value)} /></td>)}
                  <td className="px-2 py-1"><input className={inp} placeholder="A2/B1/B2" value={d.blancs?.[i]?.niv ?? ""} onChange={(e) => arr("blancs", i, "niv", e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-600">Remédiation prioritaire :</span>
          {EPR.map(([k, l]) => <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={!!d.remed?.[k]} onChange={(e) => obj("remed", k, e.target.checked)} /> {l}</label>)}
        </div>
      </section>

      {/* Évaluations de séquence */}
      <section className="card mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Évaluations de séquence</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>N°</th><th className={th}>Date</th><th className={th}>Résultat</th><th className={th}>Points forts</th><th className={th}>À travailler</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-center text-gray-500">{i + 1}</td>
                  <td className="px-2 py-1"><input type="date" className={inp} value={d.evals?.[i]?.date ?? ""} onChange={(e) => arr("evals", i, "date", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className={inp} value={d.evals?.[i]?.res ?? ""} onChange={(e) => arr("evals", i, "res", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className={inp} value={d.evals?.[i]?.forts ?? ""} onChange={(e) => arr("evals", i, "forts", e.target.value)} /></td>
                  <td className="px-2 py-1"><input className={inp} value={d.evals?.[i]?.trav ?? ""} onChange={(e) => arr("evals", i, "trav", e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Jour J + Résultats */}
      <section className="card mb-6 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-800">Jour J</h2>
          <div className="flex gap-2 mb-2">
            <label className="text-xs text-gray-600 flex-1">Date examen<input type="date" className={inp} value={d.jourJ?.date ?? ""} onChange={(e) => obj("jourJ", "date", e.target.value)} /></label>
            <label className="text-xs text-gray-600 w-24">Heure<input className={inp} placeholder="09:00" value={d.jourJ?.heure ?? ""} onChange={(e) => obj("jourJ", "heure", e.target.value)} /></label>
          </div>
          {[["c1", "Pièce d'identité"], ["c2", "Convocation"], ["c3", "30 min en avance"], ["c4", "Bien dormi et mangé"], ["c5", "Connaît le déroulement"], ["c6", "Lit chaque consigne"]].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" checked={!!d.jourJ?.[k]} onChange={(e) => obj("jourJ", k, e.target.checked)} /> {l}</label>
          ))}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-800">Résultats officiels</h2>
          {EPR.map(([k, l]) => (
            <div key={k} className="flex items-center gap-2 mb-1.5">
              <span className="w-8 text-sm text-gray-600">{l}</span>
              <input className={inp} placeholder="score" value={d.res?.[`${k}S`] ?? ""} onChange={(e) => obj("res", `${k}S`, e.target.value)} />
              <input className={inp} placeholder="niveau" value={d.res?.[`${k}N`] ?? ""} onChange={(e) => obj("res", `${k}N`, e.target.value)} />
            </div>
          ))}
          <label className="text-xs text-gray-600">Niveau global attesté<input className={inp} placeholder="A2 / B1 / B2" value={d.res?.global ?? ""} onChange={(e) => obj("res", "global", e.target.value)} /></label>
        </div>
      </section>

      {/* Suite + Bilan */}
      <section className="card mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Et maintenant ? (bilan de fin)</h2>
        {[["atteint", "A atteint son niveau visé — attestation à la préfecture"], ["repassage", "Il manque quelques points — repassage (165 €) ou consolidation"], ["superieur", "Continue vers le niveau supérieur — test de positionnement offert"]].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm py-0.5"><input type="radio" name="suite" checked={d.suite === v} onChange={() => top("suite", v)} /> {l}</label>
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="text-xs text-gray-600 w-40">Date du bilan<input type="date" className={inp} value={d.bilan?.date ?? ""} onChange={(e) => obj("bilan", "date", e.target.value)} /></label>
          <label className="text-xs text-gray-600 flex-1">Ce que je retiens<input className={inp} value={d.bilan?.retiens ?? ""} onChange={(e) => obj("bilan", "retiens", e.target.value)} /></label>
        </div>
      </section>

      <div className="flex justify-end"><button onClick={save} disabled={busy} className="btn-primary"><Save size={16} /> {busy ? "Enregistrement…" : "Enregistrer le livret"}</button></div>
    </main>
  );
}
