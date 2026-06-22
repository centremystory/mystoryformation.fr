"use client";
// app/calendrier/page.tsx — Vue calendrier hebdomadaire (semaine défilable) combinant le
// planning des élèves (séances) et le planning de l'équipe (créneaux RH). Lecture seule.
// Lieu de formation : Gagny. Les actions restent sur /planning et /planning-employes.
import { useCallback, useEffect, useMemo, useState } from "react";

const CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Seance = {
  id: string; date_seance: string; demi_journee: string; heures: number; heures_realisees: number | null;
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

const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const H_DEBUT = 8, H_FIN = 19, PX_H = 46;
const HEURES = Array.from({ length: H_FIN - H_DEBUT }, (_, i) => H_DEBUT + i);
const HAUTEUR = (H_FIN - H_DEBUT) * PX_H;
function topPx(dec: number): number { return (dec - H_DEBUT) * PX_H; }
function hhmmToDec(s: string | null): number | null { if (!s) return null; const [h, m] = s.split(":").map(Number); return h + (m || 0) / 60; }

function GrilleSemaine({ jours, jourStrings, seances, creneaux, aujourdHui }: {
  jours: Date[]; jourStrings: string[]; seances: Seance[]; creneaux: Creneau[]; aujourdHui: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div style={{ minWidth: 820 }}>
        <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
          <div />
          {jours.map((d, i) => (
            <div key={i} className={`border-l border-gray-100 px-1 py-1.5 text-center text-xs ${jourStrings[i] === aujourdHui ? "bg-mystory-clair/40 font-semibold text-mystory" : "font-medium text-gray-600"}`}>
              {JOURS_COURT[i]} <span className="font-normal text-gray-400">{jourMois(d)}</span>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
          <div className="relative" style={{ height: HAUTEUR }}>
            {HEURES.map((h) => (
              <div key={h} className="absolute right-1 text-[10px] text-gray-400" style={{ top: topPx(h) - 5 }}>{h}h</div>
            ))}
          </div>
          {jours.map((d, i) => {
            const ds = jourStrings[i];
            const sj = seances.filter((s) => s.date_seance === ds);
            const matin = sj.filter((s) => s.demi_journee === "matin");
            const aprem = sj.filter((s) => s.demi_journee !== "matin");
            const cj = creneaux.filter((c) => c.date_jour === ds);
            return (
              <div key={i} className={`relative border-l border-gray-100 ${ds === aujourdHui ? "bg-mystory-clair/10" : ""}`} style={{ height: HAUTEUR }}>
                {HEURES.map((h) => <div key={h} className="absolute inset-x-0 border-t border-gray-100" style={{ top: topPx(h) }} />)}
                {([["Matin", matin, 9.5], ["Apres-midi", aprem, 14]] as [string, Seance[], number][]).map(([lbl, arr, deb]) => {
                  if (arr.length === 0) return null;
                  const duree = Math.max(...arr.map((s) => Number(s.heures_realisees ?? s.heures) || 3));
                  const tousEmarges = arr.every((s) => s.emarge_le);
                  return (
                    <div key={lbl}
                      className={`absolute overflow-hidden rounded-md border px-1 py-0.5 text-[10px] leading-tight ${tousEmarges ? "border-success-200 bg-success-50" : "border-mystory/30 bg-mystory-clair"}`}
                      style={{ top: topPx(deb) + 1, height: duree * PX_H - 2, left: 2, width: "56%" }}>
                      <div className="font-semibold text-gray-700">{lbl === "Apres-midi" ? "Apr\u00e8s-midi" : lbl}</div>
                      {arr.slice(0, 4).map((s) => <div key={s.id} className="truncate text-gray-600">{s.stagiaire}</div>)}
                      {arr.length > 4 && <div className="text-gray-400">+{arr.length - 4}</div>}
                    </div>
                  );
                })}
                {cj.map((c) => {
                  const deb = hhmmToDec(c.heure_debut) ?? 9;
                  const fin = hhmmToDec(c.heure_fin) ?? deb + 1;
                  const nom = c.utilisateurs ? `${c.utilisateurs.prenom ?? ""} ${c.utilisateurs.nom ?? ""}`.trim() : "Equipe";
                  return (
                    <div key={c.id}
                      className="absolute overflow-hidden rounded-md border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] leading-tight"
                      style={{ top: topPx(deb) + 1, height: Math.max(18, (fin - deb) * PX_H - 2), left: "60%", width: "38%" }}>
                      <div className="truncate font-medium text-amber-800">{nom || "\u00c9quipe"}</div>
                      {c.note && <div className="truncate text-amber-600">{c.note}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PageCalendrier() {
  const [lundi, setLundi] = useState<Date>(() => lundiDeSemaine(new Date()));
  const [seances, setSeances] = useState<Seance[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [fAgence, setFAgence] = useState("toutes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vue, setVue] = useState<"grille" | "liste">("grille");

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
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          <button onClick={() => setVue("grille")} className={`rounded px-2 py-1 ${vue === "grille" ? "bg-mystory text-white" : "text-gray-600"}`}>Grille</button>
          <button onClick={() => setVue("liste")} className={`rounded px-2 py-1 ${vue === "liste" ? "bg-mystory text-white" : "text-gray-600"}`}>Liste</button>
        </div>
                <select value={fAgence} onChange={(e) => setFAgence(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white">
          <option value="toutes">Toutes agences</option>
          <option value="Gagny">Gagny</option><option value="Sarcelles">Sarcelles</option><option value="Rosny">Rosny</option>
        </select>
      </div>

      {erreur && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>}

      {vue === "grille" && (
        <GrilleSemaine jours={jours} jourStrings={jourStrings} seances={seancesSemaine} creneaux={creneaux} aujourdHui={aujourdHui} />
      )}

      {vue === "liste" && (
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
      )}

      {chargement && <p className="text-xs text-gray-400 mt-4">Mise à jour du planning équipe…</p>}
      <p className="text-xs text-gray-400 mt-4">
        Vue en lecture seule. Modifier : <a href="/planning" className="text-mystory underline">planning élèves</a> · <a href="/planning-employes" className="text-mystory underline">planning équipe</a>.
      </p>
    </main>
  );
}
