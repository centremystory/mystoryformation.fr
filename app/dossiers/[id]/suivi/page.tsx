"use client";
// app/dossiers/[id]/suivi/page.tsx — Suivi pédagogique (formatrice) : examens blancs /699 + checklist jour J.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const BLEU = "#2F72DE";
const EPR = [["ce", "CE"], ["co", "CO"], ["ee", "EE"], ["eo", "EO"]] as const;
type Blanc = { id?: string; numero: number; date_passage: string | null; ce: any; co: any; ee: any; eo: any; niveau_estime: string | null; remarque: string | null };
type Item = { cle: string; label: string };
const inp = { border: "1px solid #D0D5DD", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: "100%" } as const;

export default function SuiviPage() {
  const { id } = useParams<{ id: string }>();
  const [blancs, setBlancs] = useState<Blanc[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [charge, setCharge] = useState(true);
  const [msg, setMsg] = useState<Record<string, string>>({});

  async function charger() {
    const r = await fetch(`/api/dossiers/${id}/suivi`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) { setBlancs(j.examensBlancs); setChecklist(j.checklist || {}); setItems(j.items); }
    setCharge(false);
  }
  useEffect(() => { charger(); }, [id]);

  const majBlanc = (i: number, champ: keyof Blanc, val: any) =>
    setBlancs((prev) => prev.map((b, k) => (k === i ? { ...b, [champ]: val } : b)));

  function ajouterBlanc() {
    const n = (blancs.reduce((m, b) => Math.max(m, b.numero), 0)) + 1;
    if (n > 6) return;
    setBlancs((p) => [...p, { numero: n, date_passage: null, ce: "", co: "", ee: "", eo: "", niveau_estime: "", remarque: "" }]);
  }

  async function enregistrerBlanc(b: Blanc) {
    const cle = "b" + b.numero; setMsg((m) => ({ ...m, [cle]: "..." }));
    try {
      const r = await fetch(`/api/dossiers/${id}/suivi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examen_blanc: b }) });
      const j = await r.json();
      setMsg((m) => ({ ...m, [cle]: j.ok ? "ok" : "err" })); if (j.ok) setTimeout(() => setMsg((m) => ({ ...m, [cle]: "" })), 1500);
    } catch { setMsg((m) => ({ ...m, [cle]: "err" })); }
  }

  async function toggleCheck(cle: string) {
    const next = { ...checklist, [cle]: !checklist[cle] };
    setChecklist(next);
    fetch(`/api/dossiers/${id}/suivi`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklist: next }) }).catch(() => {});
  }

  const total = (b: Blanc) => EPR.reduce((s, [k]) => s + (Number((b as any)[k]) || 0), 0);
  const faits = items.filter((i) => checklist[i.cle]).length;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="page-title">Suivi pédagogique</h1>
      <p className="page-subtitle">Examens blancs (scores /699 par épreuve) et checklist jour J. Alimente le livret de suivi.</p>
      <a href={`/api/dossiers/${id}/livret-pdf`} target="_blank" rel="noopener" className="btn-ghost mt-2 inline-block !text-sm">📘 Voir le livret de suivi (PDF)</a>

      {charge ? <p className="mt-4 text-sm text-gray-400">Chargement…</p> : (
        <>
          {/* Examens blancs */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Examens blancs</h2>
          <div className="mt-2 space-y-3">
            {blancs.length === 0 && <p className="text-sm text-gray-400">Aucun examen blanc saisi.</p>}
            {blancs.map((b, i) => {
              const cle = "b" + b.numero; const e = msg[cle];
              return (
                <div key={b.numero} className="card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Examen blanc n°{b.numero}</span>
                    <input type="date" style={{ ...inp, width: 150 }} value={b.date_passage ?? ""} onChange={(ev) => majBlanc(i, "date_passage", ev.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {EPR.map(([k, lab]) => (
                      <label key={k} className="text-xs text-gray-500">{lab} /699
                        <input type="number" min={0} max={699} style={inp} value={(b as any)[k] ?? ""} onChange={(ev) => majBlanc(i, k as keyof Blanc, ev.target.value)} />
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs text-gray-500">Total<div className="text-sm font-semibold" style={{ color: BLEU }}>{total(b)} /2796</div></label>
                    <label className="flex-1 text-xs text-gray-500">Niveau estimé
                      <input style={inp} placeholder="ex. B1" value={b.niveau_estime ?? ""} onChange={(ev) => majBlanc(i, "niveau_estime", ev.target.value)} />
                    </label>
                    <button onClick={() => enregistrerBlanc(b)} disabled={e === "..."}
                      style={{ background: e === "ok" ? "#12B76A" : BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {e === "..." ? "…" : e === "ok" ? "✓" : "Enregistrer"}
                    </button>
                  </div>
                  <input style={{ ...inp, marginTop: 8 }} placeholder="Remarque (facultatif)" value={b.remarque ?? ""} onChange={(ev) => majBlanc(i, "remarque", ev.target.value)} />
                  {e === "err" && <div className="mt-1 text-xs text-red-600">Échec — réessaie.</div>}
                </div>
              );
            })}
          </div>
          {blancs.length < 6 && <button onClick={ajouterBlanc} className="btn-ghost mt-2 !text-sm">+ Ajouter un examen blanc</button>}

          {/* Checklist jour J */}
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Checklist jour J ({faits}/{items.length})</h2>
          <div className="mt-2 space-y-1">
            {items.map((it) => (
              <label key={it.cle} className="card flex cursor-pointer items-center gap-3 !p-3">
                <input type="checkbox" checked={!!checklist[it.cle]} onChange={() => toggleCheck(it.cle)} style={{ width: 18, height: 18 }} />
                <span className={`text-sm ${checklist[it.cle] ? "text-gray-800" : "text-gray-600"}`}>{it.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">La checklist s'enregistre automatiquement à chaque coche.</p>
        </>
      )}
    </main>
  );
}
