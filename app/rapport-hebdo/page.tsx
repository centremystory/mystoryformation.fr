"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Ligne = { id: string; activite: string; duree_minutes: number; cree_le: string; utilisateur_id: string };
type TacheFaite = { id: string; titre: string; agence: string | null; temps_minutes: number | null; fait_le: string };
type Employe = { id: string; nom: string; prenom: string | null };

function lundiDe(d: Date): Date {
  const j = d.getDay();
  const diff = j === 0 ? -6 : 1 - j;
  const l = new Date(d); l.setDate(d.getDate() + diff); l.setHours(12, 0, 0, 0);
  return l;
}
function isoJour(d: Date): string { return d.toISOString().slice(0, 10); }
function fr(d: string): string { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); }
function heures(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}

export default function RapportHebdoPage() {
  const toast = useToast();
  const [lundi, setLundi] = useState<Date>(() => lundiDe(new Date()));
  const [employe, setEmploye] = useState<string>("");
  const [data, setData] = useState<{ lignes: Ligne[]; taches: TacheFaite[]; employes: Employe[]; estEncadrement: boolean; dimanche: string } | null>(null);
  const [activite, setActivite] = useState(""); const [duree, setDuree] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const qs = new URLSearchParams({ semaine: isoJour(lundi) });
    if (employe) qs.set("employe", employe);
    const r = await fetch(`/api/rapport-hebdo?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setData(j); else setErreur(j.erreur || "Chargement impossible.");
  }, [lundi, employe]);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    setErreur(null);
    if (!activite.trim()) { setErreur("Décris l'activité."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/rapport-hebdo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: isoJour(lundi), activite, duree_minutes: Number(duree) || 0 }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Ajout impossible."); return; }
      setActivite(""); setDuree(""); await charger();
    } finally { setBusy(false); }
  }

  async function archiver(id: string) {
    try {
      await apiFetch("/api/rapport-hebdo", { method: "PATCH", body: JSON.stringify({ id, action: "archive" }) });
      toast.success("Activité retirée.");
      await charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — réessayez.");
    }
  }

  const decaler = (n: number) => { const d = new Date(lundi); d.setDate(lundi.getDate() + n * 7); setLundi(lundiDe(d)); };

  const totalManuel = (data?.lignes ?? []).reduce((s, l) => s + (l.duree_minutes || 0), 0);
  const totalTaches = (data?.taches ?? []).reduce((s, t) => s + (t.temps_minutes || 0), 0);
  const total = totalManuel + totalTaches;
  const editable = !employe || (data?.estEncadrement === false);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Rapport hebdomadaire</h1>
        <p className="page-subtitle">Ce que tu as fait cette semaine et le temps passé. Les tâches que tu as clôturées s'ajoutent automatiquement.</p>
      </div>

      <div className="card p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => decaler(-1)} className="btn-ghost !py-1 !px-2">←</button>
          <span className="text-sm font-medium">Semaine du {fr(isoJour(lundi))}{data?.dimanche ? ` au ${fr(data.dimanche)}` : ""}</span>
          <button onClick={() => decaler(1)} className="btn-ghost !py-1 !px-2">→</button>
        </div>
        {data?.estEncadrement && (
          <select value={employe} onChange={(e) => setEmploye(e.target.value)} className="input !py-1 text-sm">
            <option value="">Mon rapport</option>
            {data.employes.map((e) => <option key={e.id} value={e.id}>{e.prenom ? e.prenom + " " : ""}{e.nom}</option>)}
          </select>
        )}
      </div>

      {erreur && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}

      <div className="card divide-y">
        {(data?.taches ?? []).map((t) => (
          <div key={`t-${t.id}`} className="flex items-center justify-between gap-3 p-3">
            <div className="text-sm">
              <span className="badge badge-info mr-2">Tâche</span>{t.titre}
              {t.agence && <span className="ml-1 text-xs text-gray-400">· {t.agence}</span>}
            </div>
            <span className="text-sm text-gray-500">{t.temps_minutes != null ? heures(t.temps_minutes) : "—"}</span>
          </div>
        ))}
        {(data?.lignes ?? []).map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 p-3">
            <div className="text-sm">{l.activite}</div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{heures(l.duree_minutes)}</span>
              {editable && <button onClick={() => archiver(l.id)} className="text-xs text-gray-400 hover:text-red-600">Retirer</button>}
            </div>
          </div>
        ))}
        {(data && data.lignes.length === 0 && data.taches.length === 0) && (
          <div className="empty-state">Aucune activité cette semaine pour l'instant.</div>
        )}
        <div className="flex items-center justify-between p-3 bg-mystory-clair/40">
          <span className="text-sm font-medium">Total semaine</span>
          <span className="text-sm font-semibold text-mystory">{heures(total)}</span>
        </div>
      </div>

      {editable && (
        <div className="card p-3 mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[200px] text-sm">
            <span className="text-gray-600">Activité</span>
            <input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="ex : relances dossiers CPF" className="input mt-1 w-full" />
          </label>
          <label className="text-sm w-28">
            <span className="text-gray-600">Durée (min)</span>
            <input value={duree} onChange={(e) => setDuree(e.target.value)} inputMode="numeric" placeholder="ex : 90" className="input mt-1 w-full" />
          </label>
          <button onClick={ajouter} disabled={busy} className="btn-primary">{busy ? "Ajout…" : "Ajouter"}</button>
        </div>
      )}
    </div>
  );
}
