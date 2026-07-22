"use client";

/**
 * MYSTORY — Catalogue des formules & tarifs.
 * Grille CPF = tarifs officiels (verrouillés par le contrôle CDC).
 * Grilles « fonds propres » / OPCO = éditables avec remises (prix libre).
 * Édition réservée Direction / Manager (contrôlé côté API).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Formule = {
  id: string; certif: string; financement: string; heures: number | string;
  prix_eur: number | string; remise_pct: number | string; libelle: string;
  frais_examen_inclus: boolean; actif: boolean; ordre: number | string;
};

const GROUPES: { cle: string; titre: string; sous: string; cpf: boolean }[] = [
  { cle: "cpf", titre: "CPF", sous: "Tarifs officiels — verrouillés par le contrôle CDC (le montant du dossier doit être exactement égal).", cpf: true },
  { cle: "personnel", titre: "Fonds propres", sous: "Remises possibles — prix libre (le contrôle n'exige pas un montant exact, il interdit juste de dépasser le tarif de référence).", cpf: false },
  { cle: "opco", titre: "OPCO", sous: "Prise en charge OPCO — prix libre.", cpf: false },
];

export default function CataloguePage() {
  const toast = useToast();
  const [formules, setFormules] = useState<Formule[]>([]);
  const [charge, setCharge] = useState(true);
  const [edits, setEdits] = useState<Record<string, Partial<Formule>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const j = await apiFetch<{ formules: Formule[] }>("/api/formules", { cache: "no-store" });
      setFormules(j.formules);
      setEdits({});
    } catch (e: any) { toast.error(e?.message ?? "Chargement impossible."); }
    finally { setCharge(false); }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  // Prix CPF de référence par heures (pour calculer les remises fonds propres/OPCO).
  const prixCpf = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of formules) if (f.financement === "cpf" && f.actif) m[String(f.heures)] = Number(f.prix_eur);
    return m;
  }, [formules]);

  const val = (f: Formule, k: keyof Formule) => (edits[f.id]?.[k] ?? (f as any)[k]);
  const setVal = (id: string, k: keyof Formule, v: any) =>
    setEdits((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));

  // Remise sur une ligne fonds propres/OPCO : recalcule le prix depuis le tarif CPF de la même durée.
  function appliquerRemise(f: Formule, remise: number) {
    const base = prixCpf[String(val(f, "heures"))];
    setEdits((p) => {
      const e = { ...(p[f.id] ?? {}), remise_pct: remise };
      if (base != null) e.prix_eur = Math.round(base * (1 - remise / 100) * 100) / 100;
      return { ...p, [f.id]: e };
    });
  }

  async function enregistrer(f: Formule) {
    setBusy(f.id);
    try {
      await apiFetch("/api/formules", { method: "PATCH", body: JSON.stringify({ id: f.id, ...f, ...edits[f.id] }) });
      toast.success("Formule enregistrée.");
      await charger();
    } catch (e: any) { toast.error(e?.message ?? "Enregistrement impossible."); }
    finally { setBusy(null); }
  }

  async function supprimer(f: Formule) {
    if (!window.confirm(`Supprimer la formule ${f.heures} h (${f.financement}) ?`)) return;
    setBusy(f.id);
    try {
      await apiFetch(`/api/formules?id=${f.id}`, { method: "DELETE" });
      toast.success("Formule supprimée.");
      await charger();
    } catch (e: any) { toast.error(e?.message ?? "Suppression impossible."); }
    finally { setBusy(null); }
  }

  async function ajouter(financement: string) {
    setBusy(`add-${financement}`);
    try {
      await apiFetch("/api/formules", {
        method: "POST",
        body: JSON.stringify({ certif: "TEF_IRN", financement, heures: 6, prix_eur: 0, frais_examen_inclus: true, actif: true, ordre: 99 }),
      });
      toast.success("Formule ajoutée — complète la durée et le prix.");
      await charger();
    } catch (e: any) { toast.error(e?.message ?? "Ajout impossible."); }
    finally { setBusy(null); }
  }

  const parGroupe = (cle: string) => formules.filter((f) => f.financement === cle);
  const modifiee = (id: string) => edits[id] && Object.keys(edits[id]).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Catalogue des formules & tarifs</h1>
        <p className="page-subtitle">Durées, prix et remises. La grille CPF est verrouillée par le contrôle CDC ; les fonds propres autorisent les remises.</p>
      </div>

      {charge ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        GROUPES.map((g) => {
          const lignes = parGroupe(g.cle);
          return (
            <section key={g.cle} className="card mb-5 p-4">
              <div className="mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-mystory">{g.titre}</h2>
                <p className="text-xs text-gray-500">{g.sous}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="py-1 pr-2">Durée (h)</th>
                      <th className="py-1 pr-2">Prix (€)</th>
                      {!g.cpf && <th className="py-1 pr-2">Remise %</th>}
                      <th className="py-1 pr-2">Frais examen inclus</th>
                      <th className="py-1 pr-2">Actif</th>
                      <th className="py-1 pr-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.length === 0 && (
                      <tr><td colSpan={g.cpf ? 5 : 6} className="py-2 text-xs text-gray-400">Aucune formule — ajoutez-en une ci-dessous.</td></tr>
                    )}
                    {lignes.map((f) => (
                      <tr key={f.id} className="border-t border-gray-100">
                        <td className="py-1 pr-2">
                          <input type="number" min={1} value={String(val(f, "heures"))} onChange={(e) => setVal(f.id, "heures", e.target.value)} className="input w-20" />
                        </td>
                        <td className="py-1 pr-2">
                          <input type="number" min={0} step={5} value={String(val(f, "prix_eur"))} onChange={(e) => setVal(f.id, "prix_eur", e.target.value)} className="input w-24" />
                        </td>
                        {!g.cpf && (
                          <td className="py-1 pr-2">
                            <input type="number" min={0} max={100} step={1} value={String(val(f, "remise_pct"))} onChange={(e) => appliquerRemise(f, Number(e.target.value))} className="input w-20" />
                            {prixCpf[String(val(f, "heures"))] != null && (
                              <span className="ml-1 text-[11px] text-gray-400">/ CPF {prixCpf[String(val(f, "heures"))]}€</span>
                            )}
                          </td>
                        )}
                        <td className="py-1 pr-2">
                          <input type="checkbox" checked={!!val(f, "frais_examen_inclus")} onChange={(e) => setVal(f.id, "frais_examen_inclus", e.target.checked)} />
                        </td>
                        <td className="py-1 pr-2">
                          <input type="checkbox" checked={!!val(f, "actif")} onChange={(e) => setVal(f.id, "actif", e.target.checked)} />
                        </td>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          <button onClick={() => enregistrer(f)} disabled={busy === f.id || !modifiee(f.id)} className="btn-primary text-xs disabled:opacity-40">
                            {busy === f.id ? "…" : "Enregistrer"}
                          </button>
                          <button onClick={() => supprimer(f)} disabled={busy === f.id} className="ml-2 text-xs text-gray-400 hover:text-red-600">Suppr.</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => ajouter(g.cle)} disabled={busy === `add-${g.cle}`} className="btn-ghost mt-2 text-xs">
                + Ajouter une formule
              </button>
            </section>
          );
        })
      )}
    </div>
  );
}
