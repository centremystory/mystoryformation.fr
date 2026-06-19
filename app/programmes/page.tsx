"use client";
// app/programmes/page.tsx — Séquençage : programmes types + modules + tableau croisé compétences.
import { useCallback, useEffect, useState } from "react";

type Module = {
  id: string; ordre: number; titre: string; objectif: string | null; duree_heures: number;
  comp_co: boolean; comp_ce: boolean; comp_eo: boolean; comp_ee: boolean;
};
type Programme = {
  id: string; certification: string; niveau: string; titre: string; description: string | null;
  auteur: string | null; cree_le: string; modules: Module[];
};

const CERTIFS = [{ v: "tef_irn", label: "TEF IRN" }, { v: "leveltel", label: "LEVELTEL" }, { v: "transverse", label: "Transverse" }];
const NIVEAUX = ["tous", "A1", "A2", "B1", "B2", "C1", "C2"];
const CERTIF_LABEL: Record<string, string> = Object.fromEntries(CERTIFS.map((c) => [c.v, c.label]));
const COMPS = [
  { key: "comp_co", label: "CO", titre: "Compréhension orale" },
  { key: "comp_ce", label: "CE", titre: "Compréhension écrite" },
  { key: "comp_eo", label: "EO", titre: "Expression orale" },
  { key: "comp_ee", label: "EE", titre: "Expression écrite" },
] as const;

function ProgrammeCard({ p, onChange }: { p: Programme; onChange: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // formulaire module
  const [titre, setTitre] = useState("");
  const [objectif, setObjectif] = useState("");
  const [duree, setDuree] = useState("");
  const [comps, setComps] = useState<Record<string, boolean>>({ comp_co: false, comp_ce: false, comp_eo: false, comp_ee: false });

  const totalHeures = p.modules.reduce((s, m) => s + Number(m.duree_heures || 0), 0);
  const heuresParComp = (key: string) => p.modules.filter((m: any) => m[key]).reduce((s, m) => s + Number(m.duree_heures || 0), 0);

  async function ajouterModule() {
    if (!titre.trim()) { setErr("Titre du module requis."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/programmes/modules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programmeId: p.id, titre, objectif, dureeHeures: Number(duree) || 0, ordre: p.modules.length + 1,
          compCo: comps.comp_co, compCe: comps.comp_ce, compEo: comps.comp_eo, compEe: comps.comp_ee,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setTitre(""); setObjectif(""); setDuree(""); setComps({ comp_co: false, comp_ce: false, comp_eo: false, comp_ee: false });
      onChange();
    } catch (e: any) { setErr(e?.message || "Ajout impossible."); }
    finally { setBusy(false); }
  }
  async function archiverModule(id: string) {
    await fetch("/api/programmes/modules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "archiver" }) });
    onChange();
  }
  async function archiverProgramme() {
    await fetch("/api/programmes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, action: "archiver" }) });
    onChange();
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      <button onClick={() => setOuvert((o) => !o)} className="w-full text-left p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{CERTIF_LABEL[p.certification] ?? p.certification}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.niveau === "tous" ? "Tous niveaux" : p.niveau}</span>
        <span className="font-medium text-gray-900">{p.titre}</span>
        <span className="flex-1" />
        <span className="text-xs text-gray-400">{p.modules.length} module(s) · {totalHeures}h</span>
        <span className="text-gray-400">{ouvert ? "▲" : "▼"}</span>
      </button>

      {ouvert && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {p.description && <p className="text-sm text-gray-500 mt-3">{p.description}</p>}

          {/* Modules */}
          <div className="mt-3 space-y-2">
            {p.modules.length === 0 ? <p className="text-sm text-gray-400">Aucun module — ajoute le premier ci-dessous.</p> :
              p.modules.map((m, i) => (
                <div key={m.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">#{i + 1}</span>
                    <span className="font-medium text-gray-900 text-sm">{m.titre}</span>
                    <span className="text-xs text-gray-500">{Number(m.duree_heures || 0)}h</span>
                    {COMPS.filter((c) => (m as any)[c.key]).map((c) => (
                      <span key={c.key} title={c.titre} className="text-xs px-1.5 py-0.5 rounded bg-mystory-clair text-mystory">{c.label}</span>
                    ))}
                    <span className="flex-1" />
                    <button onClick={() => archiverModule(m.id)} className="text-xs text-gray-400 hover:text-red-600">Retirer</button>
                  </div>
                  {m.objectif && <p className="text-xs text-gray-500 mt-1">{m.objectif}</p>}
                </div>
              ))}
          </div>

          {/* Ajout module */}
          <div className="mt-3 border border-dashed border-gray-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Ajouter un module</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px] gap-2">
              <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre du module" className="input" />
              <input value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Objectif" className="input" />
              <input value={duree} onChange={(e) => setDuree(e.target.value)} placeholder="Heures" type="number" min="0" step="0.5" className="input" />
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {COMPS.map((c) => (
                <label key={c.key} className="text-sm text-gray-700 flex items-center gap-1.5">
                  <input type="checkbox" checked={comps[c.key]} onChange={(e) => setComps((s) => ({ ...s, [c.key]: e.target.checked }))} />
                  {c.label} <span className="text-xs text-gray-400">({c.titre})</span>
                </label>
              ))}
            </div>
            {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
            <button onClick={ajouterModule} disabled={busy} className="btn-primary mt-2">
              {busy ? "Ajout…" : "Ajouter le module"}
            </button>
          </div>

          {/* Tableau croisé */}
          {p.modules.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Tableau croisé — modules × compétences</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium py-1.5 pr-2">Module</th>
                      {COMPS.map((c) => <th key={c.key} className="px-2 py-1.5 font-medium" title={c.titre}>{c.label}</th>)}
                      <th className="px-2 py-1.5 font-medium text-right">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.modules.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-2 text-gray-800">{m.titre}</td>
                        {COMPS.map((c) => <td key={c.key} className="text-center px-2 py-1.5">{(m as any)[c.key] ? "✓" : ""}</td>)}
                        <td className="text-right px-2 py-1.5 text-gray-600">{Number(m.duree_heures || 0)}h</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                      <td className="py-1.5 pr-2">Heures par compétence</td>
                      {COMPS.map((c) => <td key={c.key} className="text-center px-2 py-1.5">{heuresParComp(c.key)}h</td>)}
                      <td className="text-right px-2 py-1.5">{totalHeures}h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button onClick={archiverProgramme} className="mt-4 text-xs text-gray-400 hover:text-red-600">Archiver ce programme</button>
        </div>
      )}
    </div>
  );
}

export default function PageProgrammes() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fCertif, setFCertif] = useState("toutes");
  const [fNiveau, setFNiveau] = useState("tous-f");

  // création programme
  const [certification, setCertification] = useState("tef_irn");
  const [niveau, setNiveau] = useState("tous");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (fCertif !== "toutes") p.set("certification", fCertif);
      if (fNiveau !== "tous-f") p.set("niveau", fNiveau);
      const r = await fetch(`/api/programmes?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setProgrammes(j.programmes);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [fCertif, fNiveau]);
  useEffect(() => { charger(); }, [charger]);

  async function creer() {
    if (!titre.trim()) { setErr("Titre requis."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/programmes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certification, niveau, titre, description }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Création impossible."); return; }
      setTitre(""); setDescription("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Création impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Séquençage des cours</h1>
          <p className="page-subtitle">Programmes types réutilisables : modules, durées, compétences CECRL — avec tableau croisé.</p>
        </div>
      </header>

      {/* Création programme */}
      <section className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Nouveau programme</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={certification} onChange={(e) => setCertification(e.target.value)} className="input">
            {CERTIFS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className="input">
            {NIVEAUX.map((n) => <option key={n} value={n}>{n === "tous" ? "Tous niveaux" : n}</option>)}
          </select>
        </div>
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre du programme (ex. TEF IRN — A2 intensif)" className="w-full input mt-2" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)" rows={2} className="w-full input mt-2" />
        <button onClick={creer} disabled={busy} className="btn-primary mt-3">
          {busy ? "Création…" : "Créer le programme"}
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
        <select value={fNiveau} onChange={(e) => setFNiveau(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="tous-f">Tous niveaux</option>
          {NIVEAUX.map((n) => <option key={n} value={n}>{n === "tous" ? "Étiquette « tous »" : n}</option>)}
        </select>
      </div>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : programmes.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun programme pour ce filtre. Crée le premier ci-dessus.</p>
      ) : (
        <div className="space-y-2">
          {programmes.map((p) => <ProgrammeCard key={p.id} p={p} onChange={charger} />)}
        </div>
      )}
    </main>
  );
}
