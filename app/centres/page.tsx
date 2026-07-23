"use client";

/**
 * MYSTORY — Centres (référentiel éditable, Direction).
 * Gère les centres : adresse, accès, et ce qu'ils accueillent (formation / examen).
 * Le centre « accueille examen » alimente le choix du centre par session d'examen.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Centre = {
  code: string; nom: string; adresse: string; acces: string | null;
  accueille_formation: boolean; accueille_examen: boolean; actif: boolean; ordre: number | string;
};

export default function CentresPage() {
  const toast = useToast();
  const [centres, setCentres] = useState<Centre[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Centre>>>({});
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const j = await apiFetch<{ centres: Centre[] }>("/api/centres");
      setCentres(j.centres); setEdits({});
    } catch (e: any) { toast.error(e?.message ?? "Chargement impossible."); }
    finally { setCharge(false); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const val = (c: Centre, k: keyof Centre) => (edits[c.code]?.[k] ?? (c as any)[k]);
  const setVal = (code: string, k: keyof Centre, v: any) => setEdits((p) => ({ ...p, [code]: { ...p[code], [k]: v } }));
  const modifie = (code: string) => edits[code] && Object.keys(edits[code]).length > 0;

  async function enregistrer(c: Centre) {
    setBusy(c.code);
    try {
      await apiFetch("/api/centres", { method: "PATCH", body: JSON.stringify({ ...c, ...edits[c.code] }) });
      toast.success("Centre enregistré.");
      await charger();
    } catch (e: any) { toast.error(e?.message ?? "Enregistrement impossible."); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Centres</h1>
        <p className="page-subtitle">Adresse, accès et rôle de chaque centre. Un centre « accueille examen » devient sélectionnable pour les sessions d'examen (Gagny, Rosny…).</p>
      </div>

      {charge ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : centres.map((c) => (
        <section key={c.code} className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-mystory">{c.nom} <span className="text-gray-400">({c.code})</span></h2>
            <button onClick={() => enregistrer(c)} disabled={busy === c.code || !modifie(c.code)} className="btn-primary text-xs disabled:opacity-40">
              {busy === c.code ? "…" : "Enregistrer"}
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <label className="block">Nom
              <input value={String(val(c, "nom"))} onChange={(e) => setVal(c.code, "nom", e.target.value)} className="input mt-1 w-full" />
            </label>
            <label className="block">Adresse
              <input value={String(val(c, "adresse"))} onChange={(e) => setVal(c.code, "adresse", e.target.value)} className="input mt-1 w-full" />
            </label>
            <label className="block">Accès
              <textarea value={String(val(c, "acces") ?? "")} onChange={(e) => setVal(c.code, "acces", e.target.value)} rows={2} className="input mt-1 w-full resize-y" />
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!val(c, "accueille_formation")} onChange={(e) => setVal(c.code, "accueille_formation", e.target.checked)} /> Accueille formation</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!val(c, "accueille_examen")} onChange={(e) => setVal(c.code, "accueille_examen", e.target.checked)} /> Accueille examen</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!val(c, "actif")} onChange={(e) => setVal(c.code, "actif", e.target.checked)} /> Actif</label>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
