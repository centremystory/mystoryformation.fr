"use client";

/**
 * MYSTORY — Réglages (self-service Direction).
 * Édite les paramètres de la table public.parametres (seuils, coordonnées…) sans déploiement.
 * Accès Direction / Manager (contrôlé côté API + lib/roles).
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Param = {
  cle: string; valeur: string; type: string; categorie: string;
  libelle: string; aide: string | null; updated_at: string | null; updated_by: string | null;
};

export default function ReglagesPage() {
  const toast = useToast();
  const [params, setParams] = useState<Param[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const j = await apiFetch<{ parametres: Param[] }>("/api/parametres");
      setParams(j.parametres); setEdits({});
    } catch (e: any) { toast.error(e?.message ?? "Chargement impossible."); }
    finally { setCharge(false); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const val = (p: Param) => edits[p.cle] ?? p.valeur;
  const modifie = (p: Param) => edits[p.cle] != null && edits[p.cle] !== p.valeur;

  async function enregistrer(p: Param) {
    setBusy(p.cle);
    try {
      await apiFetch("/api/parametres", { method: "PATCH", body: JSON.stringify({ cle: p.cle, valeur: val(p) }) });
      toast.success("Réglage enregistré.");
      await charger();
    } catch (e: any) { toast.error(e?.message ?? "Enregistrement impossible."); }
    finally { setBusy(null); }
  }

  const categories = [...new Set(params.map((p) => p.categorie))];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Réglages</h1>
        <p className="page-subtitle">Paramètres pilotés par la Direction — modifiables directement, sans intervention technique.</p>
      </div>

      {charge ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : categories.map((cat) => (
        <section key={cat} className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mystory">{cat}</h2>
          <div className="space-y-3">
            {params.filter((p) => p.categorie === cat).map((p) => (
              <div key={p.cle} className="flex flex-wrap items-center gap-2">
                <div className="min-w-[220px] flex-1">
                  <div className="text-sm text-gray-800">{p.libelle}</div>
                  {p.aide && <div className="text-xs text-gray-400">{p.aide}</div>}
                </div>
                <input
                  type={p.type === "number" ? "number" : "text"}
                  value={val(p)}
                  onChange={(e) => setEdits((x) => ({ ...x, [p.cle]: e.target.value }))}
                  className="input w-44"
                />
                <button onClick={() => enregistrer(p)} disabled={busy === p.cle || !modifie(p)}
                  className="btn-primary text-xs disabled:opacity-40">
                  {busy === p.cle ? "…" : "Enregistrer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
