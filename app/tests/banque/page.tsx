"use client";

/**
 * MYSTORY — Banque de tests : liste, création, duplication, archivage.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

type T = { id: string; phase: string; certif: string; titre: string; periode: string | null; actif: boolean; nb_questions: number; cree_le: string };

export default function Banque() {
  const [tests, setTests] = useState<T[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creer, setCreer] = useState(false);
  const [phase, setPhase] = useState<"initial" | "final">("final");
  const [titre, setTitre] = useState(""); const [periode, setPeriode] = useState("");
  const [envoi, setEnvoi] = useState(false);

  function charger() {
    setChargement(true);
    fetch("/api/tests/banque", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setTests(j.tests); else setErreur(j.erreur || "Accès refusé."); })
      .catch(() => setErreur("Chargement impossible."))
      .finally(() => setChargement(false));
  }
  useEffect(charger, []);

  async function creerTest() {
    if (!titre.trim()) return;
    setEnvoi(true);
    try {
      const r = await fetch("/api/tests/banque", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", phase, titre, periode }),
      });
      const j = await r.json();
      if (j.ok) { setTitre(""); setPeriode(""); setCreer(false); charger(); } else setErreur(j.erreur || "Erreur.");
    } finally { setEnvoi(false); }
  }

  async function action(a: string, test_id: string, extra: Record<string, unknown> = {}) {
    await fetch("/api/tests/banque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a, test_id, ...extra }),
    });
    charger();
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Banque de tests</h1>
          <p className="page-subtitle">Créez, dupliquez et versionnez les tests de positionnement et finaux.</p>
        </div>
        <button onClick={() => setCreer((v) => !v)} className="btn-primary">+ Nouveau test</button>
      </div>

      {creer && (
        <div className="card mb-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-gray-700">Type
              <select value={phase} onChange={(e) => setPhase(e.target.value as "initial" | "final")} className="input ml-2">
                <option value="initial">Test initial (positionnement)</option>
                <option value="final">Test final</option>
              </select>
            </label>
            <label className="text-sm text-gray-700">Période
              <input value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="ex : Juillet 2026" className="input ml-2" />
            </label>
          </div>
          <label className="block text-sm text-gray-700">Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex : Test final – Juillet 2026" className="input mt-1 w-full" />
          </label>
          <button onClick={creerTest} disabled={envoi} className="btn-primary">{envoi ? "Création…" : "Créer"}</button>
        </div>
      )}

      {erreur && <p className="text-red-700">{erreur}</p>}
      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{t.titre} {!t.actif && <span className="badge badge-neutral ml-1">archivé</span>}</p>
                <p className="text-xs text-gray-500">{t.phase === "final" ? "Test final" : "Test initial"} · {t.periode ?? "—"} · {t.nb_questions} question(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/tests/banque/${t.id}`} className="btn-ghost !py-1 !text-xs">Éditer</Link>
                <button onClick={() => action("dupliquer", t.id)} className="btn-ghost !py-1 !text-xs">Dupliquer</button>
                {t.actif
                  ? <button onClick={() => action("archiver_test", t.id)} className="btn-ghost !py-1 !text-xs text-red-600">Archiver</button>
                  : <button onClick={() => action("activer_test", t.id, { actif: true })} className="btn-ghost !py-1 !text-xs text-mystory">Réactiver</button>}
              </div>
            </div>
          ))}
          {tests.length === 0 && <div className="empty-state">Aucun test. Créez-en un avec « + Nouveau test ».</div>}
        </div>
      )}
    </div>
  );
}
