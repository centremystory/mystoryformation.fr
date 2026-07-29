"use client";
// app/pointage/page.tsx — Pointage entrée/sortie (RH), lié au compte connecté.
import { useCallback, useEffect, useState } from "react";
import { LIEUX_TRAVAIL } from "@/lib/sites";

type Pointage = {
  id: string; utilisateur_id: string; jour: string; entree_le: string; sortie_le: string | null; site: string | null;
  utilisateurs?: { nom: string | null; prenom: string | null } | null;
};
type SessionOuverte = { id: string; entree_le: string; site: string | null } | null;

const SITES = LIEUX_TRAVAIL; // source unique (lib/sites) : 3 sites + Télétravail/Autre

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

  // Total travaillé aujourd'hui (somme des sessions du jour) — la pause déjeuner (l'écart entre
  // deux sessions) n'est jamais comptée. `tick` force le recalcul chaque minute quand une session
  // est ouverte. Fiable pour l'employé (ne voit que ses pointages) ; masqué en vue encadrement.
  const todayISO = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  void tick;
  const sessionsJour = pointages.filter((p) => p.jour === todayISO);
  const totalMinJour = sessionsJour.reduce((s, p) => {
    const fin = p.sortie_le ? new Date(p.sortie_le).getTime() : Date.now();
    return s + Math.max(0, Math.round((fin - new Date(p.entree_le).getTime()) / 60000));
  }, 0);
  const totalJourFmt = `${Math.floor(totalMinJour / 60)}h${String(totalMinJour % 60).padStart(2, "0")}`;
  // Pause déduite = amplitude (1re entrée → dernière sortie) − temps travaillé, quand ≥ 2 sessions closes.
  const sessionsClose = sessionsJour.filter((p) => p.sortie_le);
  let pauseMin = 0;
  if (sessionsClose.length >= 2) {
    const debuts = sessionsClose.map((p) => new Date(p.entree_le).getTime());
    const fins = sessionsClose.map((p) => new Date(p.sortie_le as string).getTime());
    const amplitude = Math.round((Math.max(...fins) - Math.min(...debuts)) / 60000);
    pauseMin = Math.max(0, amplitude - totalMinJour);
  }
  const pauseFmt = pauseMin >= 60 ? `${Math.floor(pauseMin / 60)}h${String(pauseMin % 60).padStart(2, "0")}` : `${pauseMin} min`;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Pointage</h1>
          <p className="page-subtitle">{peutGerer ? "Pointe ton temps · suivi de l'équipe." : "Un geste : j'arrive → je pointe. Je pars (pause ou fin) → je pointe."}</p>
        </div>
      </header>

      {/* Carte de pointage — gros bouton, pensé téléphone */}
      <section className="border border-gray-200 rounded-2xl bg-white p-5 mb-4">
        {!peutGerer && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-mystory-clair/60 px-4 py-2">
            <span className="text-sm text-gray-600">Aujourd'hui <span className="text-gray-400">(hors pause déjeuner)</span>{pauseMin > 0 && <span className="text-gray-400"> · pause déduite {pauseFmt}</span>}</span>
            <span className="text-xl font-bold text-mystory">{totalJourFmt}</span>
          </div>
        )}
        {session ? (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-gray-500">Entrée à <span className="font-semibold text-gray-900">{heure(session.entree_le)}</span>{session.site ? ` · ${session.site}` : ""}</p>
              <p className="text-4xl font-bold text-mystory mt-1">{duree(session.entree_le, null)}<span className="text-base font-normal text-gray-400"> en cours</span></p>
            </div>
            <button onClick={() => pointer("sortie")} disabled={busy}
              className="w-full py-5 rounded-2xl bg-gray-900 text-white text-lg font-bold active:scale-[0.99] transition disabled:opacity-50">
              {busy ? "…" : "🚪 Je pointe ma sortie"}
            </button>
            <p className="text-center text-xs text-gray-400">Tu pars déjeuner ? Pointe ta sortie, puis re-pointe en revenant — la pause n'est pas comptée.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Où es-tu ?</label>
              <select value={site} onChange={(e) => setSite(e.target.value)} className="input w-full text-base py-3">
                {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={() => pointer("entree")} disabled={busy}
              className="w-full py-5 rounded-2xl bg-mystory text-white text-lg font-bold active:scale-[0.99] transition disabled:opacity-50">
              {busy ? "…" : "✅ Je pointe mon arrivée"}
            </button>
            {sessionsJour.length > 0 && <p className="text-center text-xs text-gray-400">{sessionsJour.length} session(s) aujourd'hui · reviens de pause ? re-pointe simplement.</p>}
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
