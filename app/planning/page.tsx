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

export default function PagePlanning() {
  const [seances, setSeances] = useState<Seance[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fAgence, setFAgence] = useState<string>("toutes");
  const [periode, setPeriode] = useState<"avenir" | "tout">("avenir");

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/planning", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setSeances(j.seances);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

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
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning des élèves</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Séances de formation par site. Lieu de formation : <strong>Gagny</strong> ; l'agence sert au suivi interne.
          </p>
        </div>
      </header>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un élève…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 bg-white"
        />
        <div className="flex gap-1.5">
          {([["toutes", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"]] as const).map(([v, l]) => (
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
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>
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
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
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
                      <span className="shrink-0 text-xs text-emerald-700" title="Émargé">✅</span>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-300" title="À venir / non émargé">○</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Vue lecture seule. L'ajout / modification de séances par la commerciale (avec contrôle du total d'heures et du
        délai de 11 j ouvrés) arrivera dans une prochaine étape.
      </p>
    </main>
  );
}
