"use client";
// app/planning/page.tsx — Planning des élèves en formation, par site (agence d'inscription).
// Vue agenda groupée par date. Filtres : agence, période (à venir / tout), recherche.
// Rappel : le lieu de formation des documents reste Gagny ; l'agence sert au suivi interne par site.
import { useCallback, useEffect, useMemo, useState } from "react";

const CRENEAU: Record<string, string> = { matin: "Matin", apres_midi: "Après-midi" };
const CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

type Seance = {
  id: string;
  date_seance: string;
  demi_journee: string;
  heures: number;
  emarge_le: string | null;
  formatrice_id: string | null;
  absence: boolean;
  absence_motif: string | null;
  absence_le: string | null;
  dossier_id: string | null;
  certif: string | null;
  statut_dossier: string | null;
  stagiaire: string;
  agence: string | null;
  formatrice: string | null;
};

function dateLongueFr(iso: string): string {
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  } catch { return iso; }
}
const aujourdHui = () => new Date().toISOString().slice(0, 10);

type Formatrice = { id: string; nom: string; prenom: string | null };
type Edition = { id: string; date: string; demi: string; formatriceId: string };

export default function PagePlanning() {
  const [seances, setSeances] = useState<Seance[]>([]);
  const [formatrices, setFormatrices] = useState<Formatrice[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fAgence, setFAgence] = useState<string>("toutes");
  const [periode, setPeriode] = useState<"avenir" | "tout">("avenir");
  const [edition, setEdition] = useState<Edition | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const [rp, rf] = await Promise.all([
        fetch("/api/planning", { cache: "no-store" }),
        fetch("/api/inscriptions", { cache: "no-store" }),
      ]);
      const jp = await rp.json();
      if (!jp.ok) throw new Error(jp.erreur || "Erreur de chargement.");
      setSeances(jp.seances);
      try { const jf = await rf.json(); setFormatrices(jf.formatrices ?? []); } catch { /* non bloquant */ }
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const ouvrirEdition = (s: Seance) => {
    setEditErr(null);
    setEdition({ id: s.id, date: s.date_seance, demi: s.demi_journee, formatriceId: s.formatrice_id ?? "" });
  };

  const marquerAbsence = async (s: Seance, absent: boolean) => {
    setErreur(null);
    let motif: string | null = null;
    if (absent) motif = (typeof window !== "undefined" ? window.prompt("Motif de l'absence (facultatif) :", "") : "") ?? null;
    setBusy(true);
    try {
      const r = await fetch("/api/planning/absence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, absent, motif }),
      });
      const j = await r.json();
      if (!j.ok) setErreur(j.erreur || "Action refusée.");
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Action refusée.");
    } finally {
      setBusy(false);
    }
  };

  const enregistrer = async () => {
    if (!edition) return;
    setBusy(true); setEditErr(null);
    try {
      const body: any = { id: edition.id, date_seance: edition.date, demi_journee: edition.demi };
      if (edition.formatriceId) body.formatrice_id = edition.formatriceId;
      const r = await fetch("/api/planning", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Modification refusée.");
      setEdition(null);
      await charger();
    } catch (e: any) {
      setEditErr(e?.message || "Modification refusée.");
    } finally {
      setBusy(false);
    }
  };

  const q = recherche.trim().toLowerCase();
  const today = aujourdHui();

  const filtres = useMemo(
    () =>
      seances.filter((s) => {
        if (fAgence !== "toutes" && (s.agence ?? "") !== fAgence) return false;
        if (periode === "avenir" && s.date_seance < today) return false;
        if (q && !s.stagiaire.toLowerCase().includes(q)) return false;
        return true;
      }),
    [seances, fAgence, periode, q, today]
  );

  // Groupement par date
  const jours = useMemo(() => {
    const m = new Map<string, Seance[]>();
    for (const s of filtres) {
      if (!m.has(s.date_seance)) m.set(s.date_seance, []);
      m.get(s.date_seance)!.push(s);
    }
    return Array.from(m.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, items]) => ({
        date,
        items: items.sort((x, y) => x.demi_journee.localeCompare(y.demi_journee) || x.stagiaire.localeCompare(y.stagiaire)),
        heures: items.reduce((t, i) => t + i.heures, 0),
      }));
  }, [filtres]);

  const compteAgence = (ag: string) => seances.filter((s) => (s.agence ?? "") === ag && (periode === "tout" || s.date_seance >= today)).length;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Planning des élèves</h1>
            <p className="page-subtitle">
              Séances de formation par site. Lieu de formation : <strong>Gagny</strong> ; l'agence sert au suivi interne.
            </p>
          </div>
          <a href="/calendrier" className="btn-ghost text-sm whitespace-nowrap">▦ Vue calendrier (semaine)</a>
        </div>
      </header>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un élève…"
          className="input w-56 bg-white"
        />
        <div className="flex gap-1.5">
          {([["toutes", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"], ["Rosny", "Rosny"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                fAgence === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([["avenir", "À venir"], ["tout", "Tout"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setPeriode(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                periode === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : jours.length === 0 ? (
        <p className="text-gray-500">Aucune séance {fAgence !== "toutes" ? `pour ${fAgence} ` : ""}{periode === "avenir" ? "à venir" : ""}.</p>
      ) : (
        <div className="space-y-5">
          {jours.map((j) => (
            <section key={j.date}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-800 capitalize">{dateLongueFr(j.date)}</h2>
                <span className="text-xs text-gray-400">{j.items.length} séance{j.items.length > 1 ? "s" : ""} · {j.heures} h</span>
              </div>
              <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
                {j.items.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-24 shrink-0 text-gray-500">{CRENEAU[s.demi_journee] ?? s.demi_journee} · {s.heures} h</span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{s.stagiaire}</span>
                        <span className="text-gray-400"> · {CERTIF[s.certif ?? ""] ?? s.certif}</span>
                        {s.formatrice && <span className="text-gray-400"> · {s.formatrice}</span>}
                      </span>
                      {s.agence && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{s.agence}</span>
                      )}
                      {s.emarge_le ? (
                        <span className="shrink-0 text-xs text-emerald-700" title="Émargée — verrouillée">✅🔒</span>
                      ) : s.absence ? (
                        <>
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"
                            title={s.absence_motif || "Absent"}>Absent</span>
                          <button onClick={() => marquerAbsence(s, false)} disabled={busy}
                            className="shrink-0 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-mystory hover:text-mystory"
                            title="Annuler l'absence">↺</button>
                        </>
                      ) : (
                        <>
                          <span className="shrink-0 text-xs text-gray-300" title="À venir / non émargée">○</span>
                          {s.date_seance < today && (
                            <button onClick={() => marquerAbsence(s, true)} disabled={busy}
                              className="shrink-0 text-xs px-2 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50"
                              title="Marquer l'élève absent à cette séance">Absent ?</button>
                          )}
                          <button
                            onClick={() => (edition?.id === s.id ? setEdition(null) : ouvrirEdition(s))}
                            className="shrink-0 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-mystory hover:text-mystory"
                            title="Décaler / réassigner"
                          >✏️</button>
                        </>
                      )}
                    </div>

                    {edition?.id === s.id && (
                      <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-gray-600">
                            <span className="block mb-1">Date</span>
                            <input type="date" min={today} value={edition.date}
                              onChange={(e) => setEdition({ ...edition, date: e.target.value })}
                              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white" />
                          </label>
                          <label className="text-xs text-gray-600">
                            <span className="block mb-1">Demi-journée</span>
                            <select value={edition.demi}
                              onChange={(e) => setEdition({ ...edition, demi: e.target.value })}
                              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white">
                              <option value="matin">Matin</option>
                              <option value="apres_midi">Après-midi</option>
                            </select>
                          </label>
                          <label className="text-xs text-gray-600">
                            <span className="block mb-1">Formatrice</span>
                            <select value={edition.formatriceId}
                              onChange={(e) => setEdition({ ...edition, formatriceId: e.target.value })}
                              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white min-w-[10rem]">
                              <option value="">— inchangée —</option>
                              {formatrices.map((f) => (
                                <option key={f.id} value={f.id}>{f.prenom ? `${f.prenom} ` : ""}{f.nom}</option>
                              ))}
                            </select>
                          </label>
                          <button onClick={enregistrer} disabled={busy}
                            className="px-3 py-1.5 rounded-md bg-mystory text-white text-sm disabled:opacity-50">
                            {busy ? "…" : "Enregistrer"}
                          </button>
                          <button onClick={() => setEdition(null)} disabled={busy}
                            className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 text-sm">Annuler</button>
                        </div>
                        {editErr && <p className="text-xs text-red-700 mt-2">{editErr}</p>}
                        <p className="text-[11px] text-gray-400 mt-2">
                          Le total d'heures, le délai de 11 j ouvrés et la position de la séance finale sont revérifiés automatiquement.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        ✏️ permet de <strong>décaler</strong> une séance (date + demi-journée) et de <strong>réassigner la formatrice</strong>.
        Les heures restent constantes ; une séance déjà émargée est verrouillée ; aucune date dans le passé n'est acceptée.
      </p>
    </main>
  );
}
