"use client";
// app/suivi-eleves/page.tsx — Suivi des élèves en formation : progression (heures faites/à venir),
// absences, prochaine séance. Filtre par agence + recherche. Lecture seule (actions sur /planning).
import { useCallback, useEffect, useMemo, useState } from "react";

const CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

type Eleve = {
  dossier_id: string;
  certif: string | null;
  statut: string | null;
  heures_prevues: number;
  stagiaire: string;
  agence: string | null;
  heures_faites: number;
  heures_a_venir: number;
  nb_absences: number;
  nb_seances: number;
  prochaine_date: string | null;
};

function dateCourteFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }); }
  catch { return iso; }
}

export default function PageSuiviEleves() {
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fAgence, setFAgence] = useState<string>("toutes");

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/suivi-eleves", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setEleves(j.eleves);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const q = recherche.trim().toLowerCase();
  const filtres = useMemo(
    () => eleves.filter((e) => {
      if (fAgence !== "toutes" && (e.agence ?? "") !== fAgence) return false;
      if (q && !e.stagiaire.toLowerCase().includes(q)) return false;
      return true;
    }),
    [eleves, fAgence, q]
  );

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suivi des élèves</h1>
          <p className="text-sm text-gray-500 mt-0.5">Progression, absences et prochaine séance. Lieu de formation : <strong>Gagny</strong>.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un élève…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 bg-white" />
        <div className="flex gap-1.5">
          {([["toutes", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                fAgence === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {erreur && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : filtres.length === 0 ? (
        <p className="text-gray-500">Aucun élève {fAgence !== "toutes" ? `pour ${fAgence}` : "en formation"}.</p>
      ) : (
        <div className="space-y-2">
          {filtres.map((e) => {
            const pct = e.heures_prevues > 0 ? Math.min(100, Math.round((e.heures_faites / e.heures_prevues) * 100)) : 0;
            return (
              <div key={e.dossier_id} className="border border-gray-200 rounded-xl bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900">{e.stagiaire}</span>
                    <span className="text-gray-400 text-sm"> · {CERTIF[e.certif ?? ""] ?? e.certif}</span>
                  </span>
                  {e.agence && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{e.agence}</span>}
                  {e.nb_absences > 0 && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                      {e.nb_absences} absence{e.nb_absences > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-mystory" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                    {e.heures_faites}/{e.heures_prevues} h faites
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-gray-400">
                  {e.heures_a_venir} h à venir · prochaine séance : <strong className="text-gray-600">{dateCourteFr(e.prochaine_date)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Les présences proviennent de l'émargement signé ; les absences se marquent depuis le <a href="/planning" className="text-mystory underline">planning</a> (séances passées non émargées).
      </p>
    </main>
  );
}
