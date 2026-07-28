"use client";
// app/tests/tous/page.tsx — Tous les tests des stagiaires (initiaux + finaux) : vue d'ensemble,
// recherche, filtre par phase, accès direct aux PDF (sujet + correction) et au détail.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText, CheckCircle2 } from "lucide-react";

const BLEU = "#2F72DE";
type Test = {
  id: string; phase: string; statut: string | null; niveau_vise: string | null; niveau_global: string | null;
  total_sur20: number | null; ce: number | null; co: number | null; ee: number | null; eo: number | null;
  complete_le: string | null; dossier_id: string | null; certif: string | null; nom: string; agence: string | null;
};

const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");
const PHASE = (p: string) => (p === "final" ? "Test final" : "Test initial");
const STATUT: Record<string, { label: string; cls: string }> = {
  complet: { label: "Corrigé", cls: "bg-emerald-50 text-emerald-700" },
  en_cours: { label: "En cours", cls: "bg-gray-100 text-gray-600" },
  en_attente_formateur: { label: "À noter", cls: "bg-amber-50 text-amber-700" },
  annule: { label: "Annulé", cls: "bg-gray-100 text-gray-400" },
};

export default function TousLesTestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<"tous" | "initial" | "final">("tous");

  useEffect(() => {
    (async () => {
      setCharge(true); setErreur(null);
      try {
        const r = await fetch("/api/tests/liste", { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erreur || "Chargement impossible.");
        setTests(j.tests);
      } catch (e: any) { setErreur(e?.message || "Chargement impossible."); }
      finally { setCharge(false); }
    })();
  }, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tests.filter((x) => {
      if (phase !== "tous" && x.phase !== phase) return false;
      if (t && !`${x.nom} ${x.niveau_global ?? ""} ${x.niveau_vise ?? ""} ${x.agence ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [tests, q, phase]);

  const nb = (p: string) => tests.filter((x) => x.phase === p).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <div className="page-header">
        <h1 className="page-title">Tous les tests</h1>
        <p className="page-subtitle">Tests de niveau des stagiaires (initiaux &amp; finaux). Recherche par nom, accès au PDF détaillé.</p>
      </div>

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un candidat…" className="input w-full !pl-9" />
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          {([["tous", `Tous (${tests.length})`], ["initial", `Initiaux (${nb("initial")})`], ["final", `Finaux (${nb("final")})`]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setPhase(v)}
              className={`rounded px-3 py-1 ${phase === v ? "bg-mystory text-white" : "text-gray-600"}`}>{l}</button>
          ))}
        </div>
      </div>

      {charge ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : erreur ? (
        <div className="empty-state text-red-600">{erreur}</div>
      ) : visibles.length === 0 ? (
        <div className="card"><div className="empty-state"><CheckCircle2 size={26} className="text-gray-300" /><p className="text-sm text-gray-500">Aucun test ne correspond.</p></div></div>
      ) : (
        <div className="space-y-2">
          {visibles.map((x) => {
            const st = STATUT[x.statut ?? ""] ?? { label: x.statut ?? "—", cls: "bg-gray-100 text-gray-600" };
            return (
              <div key={x.id} className="card flex flex-wrap items-center gap-3 !py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{x.nom}</span>
                    <span className="badge bg-blue-50 text-blue-700">{PHASE(x.phase)}</span>
                    {x.agence && <span className="text-xs text-gray-400">{x.agence}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>{dateFr(x.complete_le)}</span>
                    {x.niveau_vise && <span>visé {x.niveau_vise}</span>}
                    <span>CE {x.ce ?? "—"} · CO {x.co ?? "—"} · EE {x.ee ?? "—"} · EO {x.eo ?? "—"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {x.niveau_global && <span className="badge" style={{ background: "#EAF1FC", color: BLEU }}>Niveau {x.niveau_global}</span>}
                  {x.total_sur20 != null && <span className="badge bg-gray-100 text-gray-600">{x.total_sur20}/20</span>}
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  <a href={`/api/tests/${x.id}/correction-pdf`} target="_blank" rel="noopener" title="PDF détaillé (correction)"
                    className="badge bg-mystory/10 text-mystory hover:bg-mystory/20"><FileText size={13} className="inline" /> PDF</a>
                  <Link href={`/tests/${x.id}`} className="text-xs text-mystory hover:underline">Détail ↗</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
