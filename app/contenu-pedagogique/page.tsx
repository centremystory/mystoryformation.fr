"use client";
// app/contenu-pedagogique/page.tsx — Bibliothèque de supports pédagogiques (upload).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Entree = {
  id: string; certification: string; niveau: string; type: string; module: string | null; titre: string; description: string | null;
  fichier_nom: string | null; fichier_type: string | null; fichier_taille: number | null;
  auteur: string | null; cree_le: string; url: string | null;
};

const CERTIFS = [{ v: "tef_irn", label: "TEF IRN" }, { v: "leveltel", label: "LEVELTEL" }, { v: "transverse", label: "Transverse" }];
const NIVEAUX = ["tous", "A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES = [
  { v: "cours", label: "Cours" }, { v: "exercice", label: "Exercice" }, { v: "correction", label: "Correction" },
  { v: "support", label: "Support" }, { v: "programme", label: "Programme" }, { v: "evaluation", label: "Évaluation" }, { v: "autre", label: "Autre" },
];
const CERTIF_LABEL: Record<string, string> = Object.fromEntries(CERTIFS.map((c) => [c.v, c.label]));
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.v, t.label]));

function taille(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
function dateFr(iso: string): string {
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function PageContenu() {
  const toast = useToast();
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // filtres
  const [fCertif, setFCertif] = useState("toutes");
  const [fNiveau, setFNiveau] = useState("tous-f");
  const [fType, setFType] = useState("tous-f");

  // formulaire
  const [certification, setCertification] = useState("tef_irn");
  const [niveau, setNiveau] = useState("tous");
  const [type, setType] = useState("cours");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [moduleNom, setModuleNom] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (fCertif !== "toutes") p.set("certification", fCertif);
      if (fNiveau !== "tous-f") p.set("niveau", fNiveau);
      if (fType !== "tous-f") p.set("type", fType);
      const r = await fetch(`/api/contenu-pedagogique?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setEntrees(j.entrees);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [fCertif, fNiveau, fType]);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    const file = fileRef.current?.files?.[0];
    if (!titre.trim()) { setErr("Titre requis."); return; }
    if (!file) { setErr("Choisis un fichier."); return; }
    setBusy("__add__"); setErr(null);
    try {
      const fd = new FormData();
      fd.set("certification", certification); fd.set("niveau", niveau); fd.set("type", type);
      fd.set("titre", titre); fd.set("description", description); fd.set("module", moduleNom); fd.set("fichier", file);
      const r = await fetch("/api/contenu-pedagogique", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setTitre(""); setDescription(""); setModuleNom(""); if (fileRef.current) fileRef.current.value = "";
      await charger();
    } catch (e: any) { setErr(e?.message || "Ajout impossible."); }
    finally { setBusy(null); }
  }

  async function archiver(id: string) {
    setBusy(`arch-${id}`);
    try {
      await apiFetch("/api/contenu-pedagogique", { method: "PATCH", body: JSON.stringify({ id, action: "archiver" }) });
      toast.success("Support archivé.");
      await charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Archivage impossible — réessayez.");
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Espace pédagogique</h1>
          <p className="page-subtitle">Cours, exercices et corrections organisés par module — accessibles à toute l'équipe. La structure des programmes se gère dans <a href="/programmes" className="text-mystory underline">Séquençage</a>.</p>
        </div>
      </header>

      {/* Upload */}
      <section className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter un support</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={certification} onChange={(e) => setCertification(e.target.value)} className="input">
            {CERTIFS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className="input">
            {NIVEAUX.map((n) => <option key={n} value={n}>{n === "tous" ? "Tous niveaux" : n}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre (ex. Cours 1 — Se présenter)" className="w-full input mt-2" />
        <input value={moduleNom} onChange={(e) => setModuleNom(e.target.value)} placeholder="Module / thème (ex. Module 1 — Vie quotidienne)" className="w-full input mt-2" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)" rows={2} className="w-full input mt-2" />
        <input ref={fileRef} type="file" className="block w-full text-sm text-gray-600 mt-2 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-mystory-clair file:text-mystory file:text-sm" />
        <p className="text-xs text-gray-400 mt-1">PDF, Word, PowerPoint, Excel, image ou txt — 25 Mo max.</p>
        <button onClick={ajouter} disabled={busy === "__add__"} className="btn-primary mt-3">
          {busy === "__add__" ? "Envoi…" : "Ajouter"}
        </button>
      </section>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-2">
        {[{ v: "toutes", label: "Toutes certifs" }, ...CERTIFS].map((c) => (
          <button key={c.v} onClick={() => setFCertif(c.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${fCertif === c.v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-700 border-gray-300 hover:border-mystory"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={fNiveau} onChange={(e) => setFNiveau(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="tous-f">Tous niveaux</option>
          {NIVEAUX.map((n) => <option key={n} value={n}>{n === "tous" ? "Tous niveaux (étiquette)" : n}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="tous-f">Tous types</option>
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </div>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : entrees.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun support pour ce filtre. Ajoute le premier ci-dessus.</p>
      ) : (
        <div className="space-y-4">
          {Array.from(
            entrees.reduce((acc, e) => {
              const k = (e.module && e.module.trim()) || "Sans module";
              if (!acc.has(k)) acc.set(k, []);
              acc.get(k)!.push(e);
              return acc;
            }, new Map<string, Entree[]>())
          ).map(([mod, items]) => (
            <div key={mod} className="space-y-2">
              <h3 className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                📚 {mod} <span className="text-xs font-normal text-gray-400">({items.length})</span>
              </h3>
              {items.map((e) => (
                <div key={e.id} className="card">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{CERTIF_LABEL[e.certification] ?? e.certification}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{e.niveau === "tous" ? "Tous niveaux" : e.niveau}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{TYPE_LABEL[e.type] ?? e.type}</span>
                <span className="flex-1" />
                <button onClick={() => archiver(e.id)} disabled={busy === `arch-${e.id}`} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Archiver</button>
              </div>
              <p className="font-medium text-gray-900">{e.titre}</p>
              {e.description && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{e.description}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
                {e.url
                  ? <a href={e.url} target="_blank" rel="noreferrer" className="text-mystory underline font-medium">Télécharger ↗</a>
                  : <span>Fichier indisponible</span>}
                {e.fichier_nom && <span>· {e.fichier_nom}</span>}
                {e.fichier_taille ? <span>· {taille(e.fichier_taille)}</span> : null}
                <span>· {dateFr(e.cree_le)}{e.auteur ? ` · ${e.auteur}` : ""}</span>
              </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
