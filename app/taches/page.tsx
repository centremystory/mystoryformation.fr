"use client";
// app/taches/page.tsx — Liste de tâches opérationnelles par agence.
// Ajout (agence + intitulé + échéance), coche « fait », archive. Filtre/groupement par agence.
import { useCallback, useEffect, useMemo, useState } from "react";

const BLEU = "#2F72DE";
const AGENCES = ["Gagny", "Sarcelles", "Rosny"] as const;

type Tache = {
  id: string;
  agence: string;
  titre: string;
  echeance: string | null;
  fait: boolean;
  fait_le: string | null;
  cree_le: string;
  assignee: string | null;
  assignee_nom: string | null;
  assignee_email: string | null;
};
type Personne = { id: string; nom: string; prenom: string | null; email: string | null };

function dateFr(iso: string | null): string {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}
const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function PageTaches() {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [filtre, setFiltre] = useState<string>("toutes");
  const [agenceAjout, setAgenceAjout] = useState<string>("Gagny");
  const [titre, setTitre] = useState("");
  const [echeance, setEcheance] = useState("");
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [assigneAjout, setAssigneAjout] = useState<string>("");
  const [monEmail, setMonEmail] = useState<string | null>(null);
  const [mesTaches, setMesTaches] = useState(false);

  useEffect(() => {
    fetch("/api/utilisateurs").then((r) => r.json()).then((j) => { if (j.ok) setPersonnes(j.utilisateurs); }).catch(() => {});
    fetch("/api/me").then((r) => r.json()).then((j) => { if (j.ok) setMonEmail(j.user?.email ?? null); }).catch(() => {});
  }, []);

  const nomPersonne = (p: Personne) => `${p.prenom ? p.prenom + " " : ""}${p.nom}`;

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/taches", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setTaches(j.taches);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    if (!titre.trim()) { setErreur("Intitulé obligatoire."); return; }
    setBusy("ajout"); setErreur(null);
    try {
      const r = await fetch("/api/taches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agence: agenceAjout, titre: titre.trim(), echeance: echeance || null, assignee: assigneAjout || null }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de l'ajout.");
      setTitre(""); setEcheance(""); setAssigneAjout("");
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de l'ajout.");
    } finally {
      setBusy(null);
    }
  }

  async function assigner(id: string, assignee: string) {
    setBusy(`as-${id}`); setErreur(null);
    try {
      const r = await fetch("/api/taches", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "assigner", assignee: assignee || null }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur.");
      await charger();
    } catch (e: any) { setErreur(e?.message || "Erreur."); }
    finally { setBusy(null); }
  }

  async function patch(id: string, action: "fait" | "repris" | "archive", cle: string) {
    setBusy(cle); setErreur(null);
    try {
      const r = await fetch("/api/taches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur.");
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  const visibles = useMemo(
    () => taches.filter((t) =>
      (filtre === "toutes" || t.agence === filtre) &&
      (!mesTaches || (!!monEmail && t.assignee_email === monEmail))),
    [taches, filtre, mesTaches, monEmail]
  );

  const groupes = useMemo(() => {
    const cibles = filtre === "toutes" ? (AGENCES as readonly string[]) : [filtre];
    return cibles
      .map((ag) => ({ agence: ag, items: visibles.filter((t) => t.agence === ag) }))
      .filter((g) => g.items.length > 0);
  }, [visibles, filtre]);

  const enRetard = (t: Tache) => !t.fait && t.echeance && t.echeance < aujourdHui();

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tâches par agence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Le pense-bête opérationnel de chaque site.</p>
        </div>
      </header>

      {/* Ajout */}
      <div className="border rounded-xl bg-gray-50 p-4 flex flex-wrap items-end gap-3 mb-5">
        <label className="text-sm">
          <span className="block mb-1 font-medium">Agence</span>
          <select value={agenceAjout} onChange={(e) => setAgenceAjout(e.target.value)}
                  className="border rounded px-3 py-2 bg-white">
            {AGENCES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="block mb-1 font-medium">Tâche</span>
          <input value={titre} onChange={(e) => setTitre(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }}
                 placeholder="Ex. Relancer les conventions non signées"
                 className="border rounded px-3 py-2 w-full" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Échéance (option.)</span>
          <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)}
                 className="border rounded px-3 py-2 bg-white" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 font-medium">Assigné·e (option.)</span>
          <select value={assigneAjout} onChange={(e) => setAssigneAjout(e.target.value)}
                  className="border rounded px-3 py-2 bg-white">
            <option value="">— Personne —</option>
            {personnes.map((p) => <option key={p.id} value={p.id}>{nomPersonne(p)}</option>)}
          </select>
        </label>
        <button onClick={ajouter} disabled={busy === "ajout"}
                className="px-4 py-2 rounded text-white font-medium disabled:opacity-50"
                style={{ background: BLEU }}>
          {busy === "ajout" ? "Ajout…" : "Ajouter"}
        </button>
      </div>

      {/* Filtre agence */}
      <div className="flex gap-1.5 mb-5">
        {([["toutes", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"], ["Rosny", "Rosny"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              filtre === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
            }`}>{l}</button>
        ))}
        {monEmail && (
          <button onClick={() => setMesTaches((v) => !v)}
            className={`ml-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              mesTaches ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
            }`}>👤 Mes tâches</button>
        )}
      </div>

      {erreur && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : groupes.length === 0 ? (
        <p className="text-gray-500">Aucune tâche {filtre !== "toutes" ? `pour ${filtre}` : ""} — ajoute la première ci-dessus.</p>
      ) : (
        <div className="space-y-6">
          {groupes.map((g) => (
            <section key={g.agence}>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                {g.agence} <span className="text-gray-400 font-normal">· {g.items.filter((t) => !t.fait).length} à faire</span>
              </h2>
              <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
                {g.items.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <input type="checkbox" checked={t.fait} disabled={busy === `t-${t.id}`}
                           onChange={() => patch(t.id, t.fait ? "repris" : "fait", `t-${t.id}`)}
                           className="h-4 w-4 accent-[#2F72DE] cursor-pointer" />
                    <span className={`flex-1 text-sm ${t.fait ? "line-through text-gray-400" : "text-gray-900"}`}>
                      {t.titre}
                      {t.echeance && (
                        <span className={`ml-2 text-xs ${enRetard(t) ? "text-red-600 font-medium" : "text-gray-400"}`}>
                          ⏱ {dateFr(t.echeance)}{enRetard(t) ? " (en retard)" : ""}
                        </span>
                      )}
                    </span>
                    <select value={t.assignee ?? ""} onChange={(e) => assigner(t.id, e.target.value)} disabled={busy === `as-${t.id}`}
                            title="Assigner" className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 max-w-[130px]">
                      <option value="">Non assigné</option>
                      {personnes.map((p) => <option key={p.id} value={p.id}>{nomPersonne(p)}</option>)}
                    </select>
                    <button onClick={() => patch(t.id, "archive", `a-${t.id}`)} disabled={busy === `a-${t.id}`}
                            title="Archiver" className="text-gray-300 hover:text-red-500 disabled:opacity-50">✕</button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Les tâches archivées (✕) ne sont pas supprimées en base — elles restent traçables, simplement masquées.
      </p>
    </main>
  );
}
