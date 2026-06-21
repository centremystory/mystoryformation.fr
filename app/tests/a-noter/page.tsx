"use client";

/**
 * MYSTORY — Tests à noter (back-office).
 * La formatrice évalue l'expression écrite et orale ; le niveau /20 est calculé et rattaché au dossier.
 */
import { useEffect, useState } from "react";

type Test = { titre: string; phase: string; consigne_ecrit: string | null; consigne_oral: string | null };
type Evaluation = {
  id: string; phase: string; dossier_id: string | null;
  nom: string | null; prenom: string | null; email: string | null;
  ce_sur10: number | null; co_sur10: number | null; ecrit: string | null; cree_le: string; test: Test | null;
};

export default function ANoter() {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tests/notation", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setEvals(j.evaluations); else setErreur(j.erreur || "Accès refusé."); })
      .catch(() => setErreur("Chargement impossible."))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tests à noter</h1>
        <p className="page-subtitle">Expression écrite et orale à évaluer pour finaliser le niveau du candidat.</p>
        <a href="/test/kiosque" target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-mystory underline">Ouvrir le kiosque de positionnement ↗</a>
      </div>
      {erreur && <p className="text-red-700">{erreur}</p>}
      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : evals.length === 0 ? (
        <div className="empty-state">Aucun test en attente de notation.</div>
      ) : (
        <div className="space-y-4">
          {evals.map((e) => (
            <CarteNotation key={e.id} ev={e} onFini={() => setEvals((p) => p.filter((x) => x.id !== e.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function CarteNotation({ ev, onFini }: { ev: Evaluation; onFini: () => void }) {
  const [ee, setEe] = useState(""); const [eo, setEo] = useState(""); const [rem, setRem] = useState("");
  const [envoi, setEnvoi] = useState(false); const [err, setErr] = useState<string | null>(null);
  const nom = `${ev.prenom ?? ""} ${ev.nom ?? ""}`.trim() || "Candidat";

  async function valider() {
    const e = Number(ee), o = Number(eo);
    if (!(e >= 0 && e <= 10) || !(o >= 0 && o <= 10)) { setErr("EE et EO doivent être entre 0 et 10."); return; }
    setEnvoi(true); setErr(null);
    try {
      const r = await fetch("/api/tests/notation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ev.id, ee_sur10: e, eo_sur10: o, remarques: rem }),
      });
      const j = await r.json();
      if (j.ok) onFini(); else setErr(j.erreur || "Erreur.");
    } catch { setErr("Erreur réseau."); }
    finally { setEnvoi(false); }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{nom}</p>
          <p className="text-xs text-gray-500">{ev.test?.titre ?? "Test"} · {ev.phase === "final" ? "Test final" : "Test initial"}</p>
        </div>
        <span className="badge badge-info">CE {ev.ce_sur10 ?? "—"}/10 · CO {ev.co_sur10 ?? "—"}/10</span>
      </div>

      {ev.test?.consigne_ecrit && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600">Expression écrite — sujet</p>
          <p className="mb-1 text-xs italic text-gray-500">{ev.test.consigne_ecrit}</p>
          <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-sm text-gray-800">
            {ev.ecrit || <span className="text-gray-400">— pas de rédaction —</span>}
          </div>
        </div>
      )}
      {ev.test?.consigne_oral && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600">Expression orale — sujet</p>
          <p className="text-xs italic text-gray-500">{ev.test.consigne_oral}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">EE /10
          <input type="number" min={0} max={10} step={0.5} value={ee} onChange={(e) => setEe(e.target.value)} className="input ml-2 w-20" />
        </label>
        <label className="text-sm text-gray-700">EO /10
          <input type="number" min={0} max={10} step={0.5} value={eo} onChange={(e) => setEo(e.target.value)} className="input ml-2 w-20" />
        </label>
      </div>
      <textarea value={rem} onChange={(e) => setRem(e.target.value)} placeholder="Remarques (facultatif)…" rows={2} className="input mt-2 w-full" />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <button onClick={valider} disabled={envoi} className="btn-primary mt-2">{envoi ? "Validation…" : "Valider la notation"}</button>
    </div>
  );
}
