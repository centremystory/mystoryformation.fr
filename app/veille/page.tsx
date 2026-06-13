"use client";
// app/veille/page.tsx — Registre de veille (Qualiopi 23→26).
import { useCallback, useEffect, useState } from "react";

type Entree = {
  id: string; categorie: string; titre: string; source: string | null; lien: string | null;
  resume: string | null; impact: string | null; date_veille: string; auteur: string | null; cree_le: string;
};

const CATS: { v: string; label: string }[] = [
  { v: "legale_reglementaire", label: "Légale & réglementaire" },
  { v: "emploi_metiers", label: "Emploi & métiers" },
  { v: "pedagogie_techno", label: "Pédagogie & technologies" },
  { v: "handicap", label: "Handicap" },
];
const LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.v, c.label]));

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function PageVeille() {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [charge, setCharge] = useState(true);
  const [filtre, setFiltre] = useState<string>("toutes");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // formulaire
  const [categorie, setCategorie] = useState("legale_reglementaire");
  const [titre, setTitre] = useState("");
  const [source, setSource] = useState("");
  const [lien, setLien] = useState("");
  const [resume, setResume] = useState("");
  const [impact, setImpact] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const q = filtre !== "toutes" ? `?categorie=${filtre}` : "";
      const r = await fetch(`/api/veille${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setEntrees(j.entrees);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [filtre]);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    if (!titre.trim()) { setErr("Titre requis."); return; }
    setBusy("__add__"); setErr(null);
    try {
      const r = await fetch("/api/veille", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie, titre, source, lien, resume, impact }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setTitre(""); setSource(""); setLien(""); setResume(""); setImpact("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Ajout impossible."); }
    finally { setBusy(null); }
  }

  async function archiver(id: string) {
    setBusy(`arch-${id}`);
    try {
      await fetch("/api/veille", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "archiver" }),
      });
      await charger();
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Veille</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registre de veille — légale, emploi/métiers, pédagogie/technologies, handicap (traçabilité Qualiopi).</p>
        </div>
      </header>

      {/* Ajout */}
      <section className="border border-gray-200 rounded-xl bg-white p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter une veille</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre / sujet" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (ex. Légifrance, France Compétences…)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="Lien (https://…)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <textarea value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Résumé" rows={2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <textarea value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impact / action pour MYSTORY" rows={2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <button onClick={ajouter} disabled={busy === "__add__"} className="mt-3 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
          {busy === "__add__" ? "Ajout…" : "Ajouter"}
        </button>
      </section>

      {/* Filtre */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[{ v: "toutes", label: "Toutes" }, ...CATS].map((c) => (
          <button key={c.v} onClick={() => setFiltre(c.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filtre === c.v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-700 border-gray-300 hover:border-mystory"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : entrees.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune veille pour ce filtre. Ajoute la première ci-dessus.</p>
      ) : (
        <div className="space-y-2">
          {entrees.map((e) => (
            <div key={e.id} className="border border-gray-200 rounded-xl bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{LABEL[e.categorie] ?? e.categorie}</span>
                <span className="text-xs text-gray-400">{dateFr(e.date_veille)}{e.auteur ? ` · ${e.auteur}` : ""}</span>
                <span className="flex-1" />
                <button onClick={() => archiver(e.id)} disabled={busy === `arch-${e.id}`}
                  className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Archiver</button>
              </div>
              <p className="font-medium text-gray-900">{e.titre}</p>
              {e.source && <p className="text-sm text-gray-500 mt-0.5">Source : {e.source}{e.lien ? " · " : ""}
                {e.lien && <a href={e.lien} target="_blank" rel="noreferrer" className="underline text-mystory">lien ↗</a>}</p>}
              {e.resume && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{e.resume}</p>}
              {e.impact && <p className="text-sm text-gray-700 mt-1"><span className="text-gray-400">Impact / action : </span>{e.impact}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
