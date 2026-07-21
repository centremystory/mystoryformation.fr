"use client";

/**
 * MYSTORY — Banque de tests : liste, création, duplication, archivage.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type T = { id: string; phase: string; certif: string; titre: string; periode: string | null; actif: boolean; nb_questions: number; cree_le: string };

export default function Banque() {
  const toast = useToast();
  const [tests, setTests] = useState<T[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creer, setCreer] = useState(false);
  const [phase, setPhase] = useState<"initial" | "final">("final");
  const [titre, setTitre] = useState(""); const [periode, setPeriode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [q, setQ] = useState("");
  const [fPhase, setFPhase] = useState<"tous" | "initial" | "final">("tous");
  const [fEtat, setFEtat] = useState<"actifs" | "archives" | "tous">("actifs");

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
    setEnvoi(true); setErreur(null);
    try {
      await apiFetch("/api/tests/banque", {
        method: "POST",
        body: JSON.stringify({ action: "creer", phase, titre, periode }),
      });
      toast.success("Test créé.");
      setTitre(""); setPeriode(""); setCreer(false); charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Création impossible — réessayez.");
    } finally { setEnvoi(false); }
  }

  async function action(a: string, test_id: string, extra: Record<string, unknown> = {}) {
    const LIBELLE: Record<string, string> = {
      dupliquer: "Test dupliqué.",
      archiver_test: "Test archivé.",
      activer_test: "Test réactivé.",
    };
    try {
      await apiFetch("/api/tests/banque", {
        method: "POST",
        body: JSON.stringify({ action: a, test_id, ...extra }),
      });
      toast.success(LIBELLE[a] ?? "Action effectuée.");
      charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — réessayez.");
    }
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

      {/* Barre de recherche + filtres (mise en page v2) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Rechercher un test…"
          className="input !py-1.5 w-56" />
        {(["tous", "initial", "final"] as const).map((v) => (
          <button key={v} onClick={() => setFPhase(v)}
            className={`rounded-full border px-3 py-1 text-xs ${fPhase === v ? "border-mystory bg-mystory text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {v === "tous" ? "Tous" : v === "initial" ? "📖 Initiaux" : "🎓 Finaux"}
          </button>
        ))}
        <span className="mx-1 text-gray-300">|</span>
        {(["actifs", "archives", "tous"] as const).map((v) => (
          <button key={v} onClick={() => setFEtat(v)}
            className={`rounded-full border px-3 py-1 text-xs ${fEtat === v ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {v === "actifs" ? "Actifs" : v === "archives" ? "Archivés" : "Tous"}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {tests.filter((t) => t.actif).length} actif(s) · {tests.filter((t) => !t.actif).length} archivé(s)
        </span>
      </div>

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {tests
            .filter((t) => fPhase === "tous" || t.phase === fPhase)
            .filter((t) => (fEtat === "tous" ? true : fEtat === "actifs" ? t.actif : !t.actif))
            .filter((t) => !q.trim() || `${t.titre} ${t.periode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
            .map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-lg px-2.5 py-1.5 text-lg ${t.phase === "final" ? "bg-violet-50" : "bg-blue-50"}`}>{t.phase === "final" ? "🎓" : "📖"}</span>
                <div>
                  <p className="font-semibold text-gray-900">{t.titre} {!t.actif && <span className="badge badge-neutral ml-1">archivé</span>}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span className={`badge ${t.phase === "final" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{t.phase === "final" ? "Test final" : "Test initial"}</span>
                    {t.periode && <span className="badge bg-gray-100 text-gray-600">{t.periode}</span>}
                    <span className={`badge ${t.nb_questions > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{t.nb_questions} question{t.nb_questions > 1 ? "s" : ""}</span>
                    <span className="text-gray-400">créé le {new Date(t.cree_le).toLocaleDateString("fr-FR")}</span>
                  </p>
                </div>
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
          {tests.filter((t) => (fPhase === "tous" || t.phase === fPhase) && (fEtat === "tous" ? true : fEtat === "actifs" ? t.actif : !t.actif) && (!q.trim() || `${t.titre} ${t.periode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))).length === 0 && (
            <div className="empty-state">Aucun test dans ce filtre. Créez-en un avec « + Nouveau test ».</div>
          )}
        </div>
      )}
    </div>
  );
}
