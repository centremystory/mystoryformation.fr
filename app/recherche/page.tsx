"use client";
// app/recherche/page.tsx — Recherche + Fiches clients (onglets Formation / Examen).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Res = { id: string; label: string; sous?: string | null; agence?: string | null; type?: string; href: string };
type Fiche = { id: string; nom: string; email: string | null; telephone: string | null; agence: string | null; meta: string | null; href: string | null };
type Onglet = "global" | "formation" | "examen";

export default function PageRecherche() {
  const [onglet, setOnglet] = useState<Onglet>("global");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ stagiaires: Res[]; formateurs: Res[]; formatrices: Res[] } | null>(null);
  const [fiches, setFiches] = useState<Fiche[] | null>(null);
  const [charge, setCharge] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => { const v = new URLSearchParams(window.location.search).get("q"); if (v) setQ(v); }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (onglet === "global") {
        if (q.trim().length < 2) { setData(null); return; }
        setCharge(true);
        try {
          const r = await fetch(`/api/recherche?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
          const j = await r.json();
          if (j.ok) setData({ stagiaires: j.stagiaires, formateurs: j.formateurs, formatrices: j.formatrices });
        } catch {} finally { setCharge(false); }
      } else {
        setCharge(true);
        try {
          const r = await fetch(`/api/fiches-clients?type=${onglet}&q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
          const j = await r.json();
          if (j.ok) setFiches(j.fiches);
        } catch {} finally { setCharge(false); }
      }
    }, 250);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, onglet]);

  const total = data ? data.stagiaires.length + data.formateurs.length + data.formatrices.length : 0;

  function Groupe({ titre, items }: { titre: string; items: Res[] }) {
    if (!items.length) return null;
    return (
      <div className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{titre} ({items.length})</p>
        <div className="space-y-1">
          {items.map((r) => (
            <Link key={r.id} href={r.href} className="card card-hover flex items-center justify-between !p-3">
              <span className="text-sm text-gray-800">{r.label || "—"}
                {r.sous && <span className="text-gray-400"> · {r.sous}</span>}
                {r.type && <span className="text-gray-400"> · {r.type === "interne" ? "interne" : "sous-traitant"}</span>}
              </span>
              {r.agence && <span className="text-xs text-gray-400">{r.agence}</span>}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  function ListeFiches() {
    if (charge && !fiches) return <p className="text-sm text-gray-400">Chargement…</p>;
    if (!fiches || fiches.length === 0) return <p className="text-sm text-gray-500">Aucune fiche{q ? " pour cette recherche" : ""}.</p>;
    return (
      <>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          {onglet === "formation" ? "Fiches Formation" : "Fiches Examen"} ({fiches.length}{fiches.length >= 200 ? "+" : ""})
        </p>
        <div className="space-y-1">
          {fiches.map((f) => {
            const contenu = (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-800">{f.nom}
                  {f.email && <span className="text-gray-400"> · {f.email}</span>}
                  {f.meta && <span className="text-gray-400"> · {f.meta}</span>}
                </span>
                {f.agence && <span className="shrink-0 text-xs text-gray-400">{f.agence}</span>}
              </div>
            );
            return f.href
              ? <Link key={f.id} href={f.href} className="card card-hover block !p-3">{contenu}</Link>
              : <div key={f.id} className="card block !p-3">{contenu}</div>;
          })}
        </div>
      </>
    );
  }

  const tab = (val: Onglet, label: string) => (
    <button onClick={() => setOnglet(val)}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${onglet === val ? "border-mystory text-mystory" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Recherche &amp; fiches clients</h1>
          <p className="page-subtitle">Recherche globale, ou parcours des fiches par Formation / Examen.</p>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 border-b border-gray-200">
        {tab("global", "Recherche")}
        {tab("formation", "Fiches Formation")}
        {tab("examen", "Fiches Examen")}
      </nav>

      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={onglet === "global" ? "Tapez un nom…" : "Filtrer par nom, prénom, email… (vide = tout afficher)"} className="input pl-10" />
      </div>

      {onglet === "global" ? (
        <>
          {q.trim().length >= 2 && !charge && total === 0 && <p className="text-sm text-gray-500">Aucun résultat.</p>}
          {charge && <p className="text-sm text-gray-400">Recherche…</p>}
          {q.trim().length < 2 && <p className="text-sm text-gray-400">Tapez au moins 2 lettres, ou utilisez les onglets Formation / Examen pour parcourir toutes les fiches.</p>}
          {data && (
            <>
              <Groupe titre="Stagiaires / dossiers" items={data.stagiaires} />
              <Groupe titre="Formateurs" items={data.formateurs} />
              <Groupe titre="Formatrices" items={data.formatrices} />
            </>
          )}
        </>
      ) : <ListeFiches />}
    </main>
  );
}
