"use client";
// app/planning-employes/page.tsx — Planning de travail des employés (RH).
import { useCallback, useEffect, useMemo, useState } from "react";

type Creneau = {
  id: string; utilisateur_id: string; date_jour: string; heure_debut: string | null; heure_fin: string | null;
  site: string; note: string | null; auteur: string | null;
  utilisateurs?: { nom: string | null; prenom: string | null } | null;
};
type Employe = { id: string; nom: string | null; prenom: string | null };

const SITES = ["Gagny", "Sarcelles", "Rosny", "Télétravail", "Autre"];

function dateLongue(iso: string): string {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
}
function hhmm(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function nomEmploye(c: Creneau, employes: Employe[]): string {
  const u = c.utilisateurs;
  if (u && (u.prenom || u.nom)) return [u.prenom, u.nom].filter(Boolean).join(" ");
  const e = employes.find((x) => x.id === c.utilisateur_id);
  return e ? [e.prenom, e.nom].filter(Boolean).join(" ") : "—";
}

export default function PagePlanningEmployes() {
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [peutGerer, setPeutGerer] = useState(false);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // filtres (Direction)
  const [fEmploye, setFEmploye] = useState("");
  const [fSite, setFSite] = useState("");

  // formulaire d'affectation
  const [utilisateurId, setUtilisateurId] = useState("");
  const [dateJour, setDateJour] = useState("");
  const [heureDebut, setHeureDebut] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [site, setSite] = useState("Gagny");
  const [note, setNote] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (fEmploye) p.set("employe", fEmploye);
      if (fSite) p.set("site", fSite);
      const r = await fetch(`/api/planning-employes?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setCreneaux(j.creneaux); setPeutGerer(j.peutGerer); setEmployes(j.employes ?? []);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [fEmploye, fSite]);
  useEffect(() => { charger(); }, [charger]);

  async function affecter() {
    if (!utilisateurId) { setErr("Choisis un employé."); return; }
    if (!dateJour) { setErr("Choisis une date."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/planning-employes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utilisateurId, dateJour, heureDebut, heureFin, site, note }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Affectation impossible."); return; }
      setNote(""); setHeureDebut(""); setHeureFin("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Affectation impossible."); }
    finally { setBusy(false); }
  }

  async function supprimer(id: string) {
    try {
      await fetch("/api/planning-employes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "supprimer" }) });
      await charger();
    } catch (e: any) { setErr(e?.message || "Suppression impossible."); }
  }

  // Regroupement par jour
  const parJour = useMemo(() => {
    const m = new Map<string, Creneau[]>();
    for (const c of creneaux) { if (!m.has(c.date_jour)) m.set(c.date_jour, []); m.get(c.date_jour)!.push(c); }
    return Array.from(m.entries());
  }, [creneaux]);

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning équipe</h1>
          <p className="text-sm text-gray-500 mt-0.5">{peutGerer ? "Affecte les créneaux de travail par employé et par site." : "Tes créneaux de travail."}</p>
        </div>
      </header>

      {peutGerer && (
        <section className="border border-gray-200 rounded-xl bg-white p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Nouveau créneau</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={utilisateurId} onChange={(e) => setUtilisateurId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Employé —</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{[e.prenom, e.nom].filter(Boolean).join(" ") || e.id}</option>)}
            </select>
            <select value={site} onChange={(e) => setSite(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="text-sm text-gray-600 flex items-center gap-2">Jour <input type="date" value={dateJour} onChange={(e) => setDateJour(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" /></label>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              De <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              à <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (poste, tâche…)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2" />
          <button onClick={affecter} disabled={busy} className="mt-3 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Ajout…" : "Affecter"}
          </button>

          <div className="flex flex-wrap gap-2 mt-4">
            <select value={fEmploye} onChange={(e) => setFEmploye(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="">Tous les employés</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{[e.prenom, e.nom].filter(Boolean).join(" ") || e.id}</option>)}
            </select>
            <select value={fSite} onChange={(e) => setFSite(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="">Tous les sites</option>
              {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </section>
      )}

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : parJour.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun créneau pour l'instant.</p>
      ) : (
        <div className="space-y-5">
          {parJour.map(([jour, items]) => (
            <div key={jour}>
              <h3 className="text-sm font-semibold text-gray-700 capitalize mb-2">{dateLongue(jour)}</h3>
              <div className="space-y-2">
                {items.map((c) => (
                  <div key={c.id} className="border border-gray-200 rounded-xl bg-white p-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{c.site}</span>
                    {peutGerer && <span className="font-medium text-gray-900 text-sm">{nomEmploye(c, employes)}</span>}
                    {(c.heure_debut || c.heure_fin) && <span className="text-sm text-gray-600">{hhmm(c.heure_debut)}{c.heure_fin ? `–${hhmm(c.heure_fin)}` : ""}</span>}
                    {c.note && <span className="text-sm text-gray-500">· {c.note}</span>}
                    <span className="flex-1" />
                    {peutGerer && <button onClick={() => supprimer(c.id)} className="text-xs text-gray-400 hover:text-red-600">Retirer</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
