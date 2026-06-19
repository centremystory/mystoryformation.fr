"use client";
// app/pointage/page.tsx — Pointage entrée/sortie (RH), lié au compte connecté.
import { useCallback, useEffect, useState } from "react";

type Pointage = {
  id: string; utilisateur_id: string; jour: string; entree_le: string; sortie_le: string | null; site: string | null;
  utilisateurs?: { nom: string | null; prenom: string | null } | null;
};
type SessionOuverte = { id: string; entree_le: string; site: string | null } | null;

const SITES = ["Gagny", "Sarcelles", "Rosny", "Télétravail", "Autre"];

function heure(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }); }
  catch { return iso; }
}
function jourFr(iso: string): string {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return iso; }
}
function duree(debut: string, fin: string | null): string {
  const a = new Date(debut).getTime();
  const b = fin ? new Date(fin).getTime() : Date.now();
  let min = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(min / 60); min = min % 60;
  return `${h}h${String(min).padStart(2, "0")}`;
}
function nom(p: Pointage): string {
  const u = p.utilisateurs;
  return u ? [u.prenom, u.nom].filter(Boolean).join(" ") || "—" : "—";
}

export default function PagePointage() {
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [session, setSession] = useState<SessionOuverte>(null);
  const [peutGerer, setPeutGerer] = useState(false);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [site, setSite] = useState("Gagny");
  const [tick, setTick] = useState(0); // pour rafraîchir le chrono de la session ouverte

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch("/api/pointage", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setPointages(j.pointages); setSession(j.sessionOuverte); setPeutGerer(j.peutGerer);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  async function pointer(action: "entree" | "sortie") {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/pointage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "entree" ? { action, site } : { action }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Pointage impossible."); return; }
      await charger();
    } catch (e: any) { setErr(e?.message || "Pointage impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Pointage</h1>
          <p className="page-subtitle">{peutGerer ? "Pointe ton temps · suivi de l'équipe." : "Pointe ton entrée et ta sortie."}</p>
        </div>
      </header>

      {/* Carte de pointage */}
      <section className="border border-gray-200 rounded-xl bg-white p-5 mb-6">
        {session ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-gray-500">Entrée pointée à <span className="font-semibold text-gray-900">{heure(session.entree_le)}</span>{session.site ? ` · ${session.site}` : ""}</p>
              <p className="text-2xl font-bold text-mystory mt-1">{duree(session.entree_le, null)}<span className="text-sm font-normal text-gray-400"> en cours{tick >= 0 ? "" : ""}</span></p>
            </div>
            <button onClick={() => pointer("sortie")} disabled={busy} className="px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? "…" : "Pointer ma sortie"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-gray-500 mb-1">Aucune entrée en cours.</p>
              <select value={site} onChange={(e) => setSite(e.target.value)} className="input">
                {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={() => pointer("entree")} disabled={busy} className="btn-primary">
              {busy ? "…" : "Pointer mon entrée"}
            </button>
          </div>
        )}
      </section>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      <h2 className="text-sm font-semibold text-gray-800 mb-2">{peutGerer ? "Historique de l'équipe" : "Mon historique"}</h2>
      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : pointages.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun pointage pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          {pointages.map((p) => (
            <div key={p.id} className="border border-gray-200 rounded-xl bg-white p-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500 w-28">{jourFr(p.jour)}</span>
              {peutGerer && <span className="font-medium text-gray-900">{nom(p)}</span>}
              <span className="text-gray-700">{heure(p.entree_le)} → {heure(p.sortie_le)}</span>
              {p.site && <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{p.site}</span>}
              <span className="flex-1" />
              <span className={`font-semibold ${p.sortie_le ? "text-gray-900" : "text-amber-600"}`}>
                {p.sortie_le ? duree(p.entree_le, p.sortie_le) : "en cours"}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
