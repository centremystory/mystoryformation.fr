"use client";
// app/calendrier/page.tsx — Vue calendrier hebdomadaire (semaine défilable) combinant le
// planning des élèves (séances) et le planning de l'équipe (créneaux RH). Lecture seule.
// Lieu de formation : Gagny. Les actions restent sur /planning et /planning-employes.
import { useCallback, useEffect, useMemo, useState } from "react";

const CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Seance = {
  id: string; date_seance: string; demi_journee: string; heures: number;
  emarge_le: string | null; absence: boolean; stagiaire: string; certif: string | null;
  agence: string | null; formatrice: string | null;
};
type Creneau = {
  id: string; date_jour: string; heure_debut: string | null; heure_fin: string | null;
  site: string | null; note: string | null; utilisateurs?: { nom: string | null; prenom: string | null } | null;
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lundiDeSemaine(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0);
  const jour = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - jour);
  return d;
}
function addJours(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function jourMois(d: Date): string { return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); }
function hhmm(s: string | null): string { return s ? s.slice(0, 5) : ""; }

export default function PageCalendrier() {
  const [lundi, setLundi] = useState<Date>(() => lundiDeSemaine(new Date()));
  const [seances, setSeances] = useState<Seance[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [fAgence, setFAgence] = useState("toutes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => addJours(lundi, i)), [lundi]);
  const jourStrings = useMemo(() => jours.map(isoDate), [jours]);
  const aujourdHui = isoDate(new Date());

  // Séances élèves : chargées une fois (toutes), filtrées par semaine côté client.
  useEffect(() => {
    fetch("/api/planning", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSeances(j.seances); else setErreur(j.erreur || "Erreur planning."); })
      .catch(() => setErreur("Erreur de chargement du planning."));
  }, []);

  // Créneaux équipe : rechargés à chaque semaine (filtre serveur depuis/jusqu).
  const chargerEquipe = useCallback(async () => {
    setChargement(true);
    try {
      const depuis = jourStrings[0], jusqu = jourStrings[6];
      const r = await fetch(`/api/planning-employes?depuis=${depuis}&jusqu=${jusqu}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setCreneaux(j.creneaux ?? []);
    } catch { /* silencieux : le calendrier reste utilisable avec les séances */ }
    finally { setChargement(false); }
  }, [jourStrings]);
  useEffect(() => { chargerEquipe(); }, [chargerEquipe]);

  const seancesSemaine = useMemo(
    () => seances.filter((s) => s.date_seance >= jourStrings[0] && s.date_seance <= jourStrings[6]
      && (fAgence === "toutes" || (s.agence ?? "") === fAgence)),
    [seances, jourStrings, fAgence]
  );

  const rangeLabel = `${jourMois(jours[0])} → ${jourMois(jours[6])} ${jours[6].getFullYear()}`;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Planning — vue calendrier</h1>
            <p className="page-subtitle">Vue d'ensemble de la semaine : séances élèves &amp; planning équipe. Lieu : <strong>Gagny</strong>.</p>
          </div>
          <a href="/planning" className="btn-ghost text-sm whitespace-nowrap">☰ Vue liste (planning)</a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setLundi(addJours(lundi, -7))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">◀ Semaine</button>
        <button onClick={() => setLundi(lundiDeSemaine(new Date()))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">Cette semaine</button>
        <button onClick={() => setLundi(addJours(lundi, 7))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">Semaine ▶</button>
        <span className="ml-1 text-sm font-medium text-gray-700">{rangeLabel}</span>
        <span className="flex-1" />
        <select value={fAgence} onChange={(e) => setFAgence(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white">
          <option value="toutes">Toutes agences</option>
          <option value="Gagny">Gagny</option><option value="Sarcelles">Sarcelles</option><option value="Rosny">Rosny</option>
        </select>
      </div>

      {erreur && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>}

      <div className="space-y-2">
        {jours.map((d, i) => {
          const ds = jourStrings[i];
          const sj = seancesSemaine.filter((s) => s.date_seance === ds);
          const matin = sj.filter((s) => s.demi_journee === "matin");
          const aprem = sj.filter((s) => s.demi_journee !== "matin");
          const cj = creneaux.filter((c) => c.date_jour === ds);
          const vide = sj.length === 0 && cj.length === 0;
          const estAujourdhui = ds === aujourdHui;
          return (
            <div key={ds} className={`border rounded-xl bg-white px-4 py-3 ${estAujourdhui ? "border-mystory ring-1 ring-mystory/30" : "border-gray-200"}`}>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900">{JOURS[i]}</span>
                <span className="text-sm text-gray-400">{jourMois(d)}</span>
                {estAujourdhui && <span className="text-[11px] px-2 py-0.5 rounded-full bg-mystory text-white">aujourd'hui</span>}
              </div>

              {vide ? (
                <p className="text-sm text-gray-300 mt-1">Rien de prévu</p>
              ) : (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Élèves</p>
                    {sj.length === 0 ? <p className="text-sm text-gray-300">—</p> : (
                      <ul className="space-y-1">
                        {[["Matin", matin], ["Après-midi", aprem]].map(([lbl, arr]: any) => (arr as Seance[]).length > 0 && (
                          <li key={lbl as string} className="text-sm">
                            <span className="text-xs text-gray-400">{lbl}</span>
                            {(arr as Seance[]).map((s) => (
                              <div key={s.id} className="flex items-center gap-1.5 text-gray-700">
                                <span className="truncate">{s.stagiaire}</span>
                                <span className="text-xs text-gray-400">{CERTIF[s.certif ?? ""] ?? s.certif} · {s.heures}h</span>
                                {s.emarge_le ? <span title="Émargé" className="text-green-600 text-xs">✓</span>
                                  : s.absence ? <span title="Absent" className="text-red-500 text-xs">✗</span> : null}
                              </div>
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Équipe</p>
                    {cj.length === 0 ? <p className="text-sm text-gray-300">—</p> : (
                      <ul className="space-y-1">
                        {cj.map((c) => (
                          <li key={c.id} className="text-sm text-gray-700">
                            {`${c.utilisateurs?.prenom ?? ""} ${c.utilisateurs?.nom ?? ""}`.trim() || "—"}
                            {(c.heure_debut || c.heure_fin) && <span className="text-xs text-gray-400"> · {hhmm(c.heure_debut)}{c.heure_fin ? `–${hhmm(c.heure_fin)}` : ""}</span>}
                            {c.site && <span className="text-xs text-gray-400"> · {c.site}</span>}
                            {c.note && <span className="text-xs text-gray-400"> · {c.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {chargement && <p className="text-xs text-gray-400 mt-4">Mise à jour du planning équipe…</p>}
      <p className="text-xs text-gray-400 mt-4">
        Vue en lecture seule. Modifier : <a href="/planning" className="text-mystory underline">planning élèves</a> · <a href="/planning-employes" className="text-mystory underline">planning équipe</a>.
      </p>
    </main>
  );
}
