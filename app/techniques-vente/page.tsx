"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Fiche = { id: string; categorie: string; titre: string; contenu: string; ordre: number };

const CAT_LABEL: Record<string, string> = {
  decouverte: "Découverte du besoin",
  formation: "Vendre la formation",
  examen: "Vendre l'examen",
  closing: "Closing & objections",
  conformite: "Conformité commerciale",
  autre: "Autre",
};
const CAT_ORDRE = ["decouverte", "formation", "examen", "closing", "conformite", "autre"];

/** Rendu léger : lignes « - » en liste, **gras**, reste en paragraphes. */
function Rendu({ texte }: { texte: string }) {
  const lignes = texte.split("\n");
  const blocs: JSX.Element[] = [];
  let liste: string[] = [];
  const gras = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  const flush = (k: number) => {
    if (liste.length) {
      blocs.push(<ul key={`u${k}`} className="my-1 list-disc pl-5 space-y-0.5">{liste.map((l, i) => <li key={i}>{gras(l)}</li>)}</ul>);
      liste = [];
    }
  };
  lignes.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith("- ")) { liste.push(t.slice(2)); return; }
    flush(i);
    if (t) blocs.push(<p key={`p${i}`} className="my-1">{gras(t)}</p>);
  });
  flush(9999);
  return <div className="text-sm text-gray-700 leading-relaxed">{blocs}</div>;
}

export default function TechniquesVentePage() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [recherche, setRecherche] = useState("");
  const [peutEditer, setPeutEditer] = useState(false);
  const [charge, setCharge] = useState(true);
  const [edit, setEdit] = useState<Record<string, { titre: string; contenu: string }>>({});
  const [nouv, setNouv] = useState<{ categorie: string; titre: string; contenu: string } | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    const [r, me] = await Promise.all([
      fetch("/api/techniques-vente", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})),
    ]);
    const j = await r.json();
    if (j.ok) setFiches(j.fiches);
    const roles: string[] = me?.roles ?? (me?.role ? [me.role] : []);
    setPeutEditer(roles.length === 0 || roles.includes("direction") || roles.includes("manager") || roles.includes("staff"));
    setCharge(false);
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return fiches;
    return fiches.filter((f) => (f.titre + " " + f.contenu).toLowerCase().includes(q));
  }, [fiches, recherche]);

  const parCat = useMemo(() => {
    const m: Record<string, Fiche[]> = {};
    for (const f of filtrees) (m[f.categorie] ??= []).push(f);
    return m;
  }, [filtrees]);

  async function sauverEdit(id: string) {
    const e = edit[id]; if (!e) return;
    await fetch("/api/techniques-vente", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...e }) });
    setEdit((p) => { const n = { ...p }; delete n[id]; return n; });
    await charger();
  }
  async function archiver(id: string) {
    if (!window.confirm("Archiver cette fiche ?")) return;
    await fetch("/api/techniques-vente", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "archiver" }) });
    await charger();
  }
  async function ajouter() {
    if (!nouv || !nouv.titre.trim() || !nouv.contenu.trim()) return;
    await fetch("/api/techniques-vente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nouv) });
    setNouv(null); await charger();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Techniques de vente</h1>
        <p className="page-subtitle">Le guide commercial MYSTORY : vendre plus de formations et d'examens, proprement. À enrichir au fil du temps.</p>
      </div>

      <div className="card p-3 mb-4 flex items-center gap-2">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une technique…" className="input flex-1" />
        {peutEditer && !nouv && (
          <button onClick={() => setNouv({ categorie: "decouverte", titre: "", contenu: "" })} className="btn-primary whitespace-nowrap">+ Fiche</button>
        )}
      </div>

      {peutEditer && nouv && (
        <div className="card p-3 mb-4 space-y-2">
          <select value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} className="input">
            {CAT_ORDRE.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select>
          <input value={nouv.titre} onChange={(e) => setNouv({ ...nouv, titre: e.target.value })} placeholder="Titre de la technique" className="input w-full" />
          <textarea value={nouv.contenu} onChange={(e) => setNouv({ ...nouv, contenu: e.target.value })} rows={6} placeholder="Contenu (une idée par ligne ; « - » pour une puce ; **gras**)" className="input w-full" />
          <div className="flex gap-2">
            <button onClick={ajouter} className="btn-primary">Enregistrer</button>
            <button onClick={() => setNouv(null)} className="btn-ghost">Annuler</button>
          </div>
        </div>
      )}

      {charge && <p className="text-sm text-gray-400">Chargement…</p>}

      {!charge && CAT_ORDRE.filter((c) => parCat[c]?.length).map((c) => (
        <section key={c} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mystory">{CAT_LABEL[c]}</h2>
          <div className="space-y-3">
            {parCat[c].map((f) => (
              <div key={f.id} className="card p-4">
                {edit[f.id] ? (
                  <div className="space-y-2">
                    <input value={edit[f.id].titre} onChange={(e) => setEdit((p) => ({ ...p, [f.id]: { ...p[f.id], titre: e.target.value } }))} className="input w-full font-semibold" />
                    <textarea value={edit[f.id].contenu} onChange={(e) => setEdit((p) => ({ ...p, [f.id]: { ...p[f.id], contenu: e.target.value } }))} rows={8} className="input w-full" />
                    <div className="flex gap-2">
                      <button onClick={() => sauverEdit(f.id)} className="btn-primary">Enregistrer</button>
                      <button onClick={() => setEdit((p) => { const n = { ...p }; delete n[f.id]; return n; })} className="btn-ghost">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-800">{f.titre}</h3>
                      {peutEditer && (
                        <div className="flex shrink-0 gap-2 text-xs">
                          <button onClick={() => setEdit((p) => ({ ...p, [f.id]: { titre: f.titre, contenu: f.contenu } }))} className="text-mystory hover:underline">Modifier</button>
                          <button onClick={() => archiver(f.id)} className="text-gray-400 hover:text-red-600">Archiver</button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1"><Rendu texte={f.contenu} /></div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
