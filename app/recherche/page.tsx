"use client";
// app/recherche/page.tsx — Recherche globale (stagiaires/dossiers, formateurs, formatrices).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Res = { id: string; label: string; sous?: string | null; agence?: string | null; type?: string; href: string };

export default function PageRecherche() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ stagiaires: Res[]; formateurs: Res[]; formatrices: Res[] } | null>(null);
  const [charge, setCharge] = useState(false);
  const timer = useRef<any>(null);

  // pré-remplissage depuis ?q=
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) setQ(v);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setData(null); return; }
    timer.current = setTimeout(async () => {
      setCharge(true);
      try {
        const r = await fetch(`/api/recherche?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setData({ stagiaires: j.stagiaires, formateurs: j.formateurs, formatrices: j.formatrices });
      } catch {} finally { setCharge(false); }
    }, 250);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const total = data ? data.stagiaires.length + data.formateurs.length + data.formatrices.length : 0;

  function Groupe({ titre, items }: { titre: string; items: Res[] }) {
    if (!items.length) return null;
    return (
      <div className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">{titre} ({items.length})</p>
        <div className="space-y-1">
          {items.map((r) => (
            <Link key={r.id} href={r.href}
              className="card card-hover flex items-center justify-between !p-3">
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Recherche</h1>
          <p className="page-subtitle">Un stagiaire, un dossier, un formateur ou une formatrice — par nom, prénom ou email.</p>
        </div>
      </header>
      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tapez un nom…" className="input pl-10" />
      </div>

      {q.trim().length >= 2 && !charge && total === 0 && <p className="text-sm text-gray-500">Aucun résultat.</p>}
      {charge && <p className="text-sm text-gray-400">Recherche…</p>}

      {data && (
        <>
          <Groupe titre="Stagiaires / dossiers" items={data.stagiaires} />
          <Groupe titre="Formateurs" items={data.formateurs} />
          <Groupe titre="Formatrices" items={data.formatrices} />
        </>
      )}
    </main>
  );
}
