"use client";
// app/satisfaction/page.tsx — Satisfaction à chaud par cours (saisie équipe).
import { useCallback, useEffect, useState } from "react";

type Seance = {
  seance_id: string; dossier_id: string; date_seance: string; demi_journee: string | null; contenu: string | null;
  civilite: string | null; stagiaire_nom: string | null; stagiaire_prenom: string | null; agence: string | null;
  formatrice_nom: string | null; formatrice_prenom: string | null;
  note: number | null; commentaire: string | null; note_le: string | null; note_auteur: string | null;
};
type Resume = { total: number; notees: number; moyenne: number | null };

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function nomStagiaire(s: Seance): string {
  return [s.civilite, s.stagiaire_prenom, s.stagiaire_nom].filter(Boolean).join(" ") || "Stagiaire";
}
function nomFormatrice(s: Seance): string {
  return [s.formatrice_prenom, s.formatrice_nom].filter(Boolean).join(" ") || "—";
}

function LigneSeance({ s, onSaved }: { s: Seance; onSaved: () => void }) {
  const [note, setNote] = useState<number | null>(s.note);
  const [commentaire, setCommentaire] = useState<string>(s.commentaire ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function enregistrer() {
    if (!note) { setErr("Choisis une note."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/satisfaction-cours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seanceId: s.seance_id, note, commentaire }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Enregistrement impossible."); return; }
      onSaved();
    } catch (e: any) { setErr(e?.message || "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs text-gray-400">{dateFr(s.date_seance)}{s.demi_journee ? ` · ${s.demi_journee}` : ""}{s.agence ? ` · ${s.agence}` : ""}</span>
        <span className="flex-1" />
        {s.note != null && <span className="text-xs text-green-700">Noté {s.note}/5{s.note_auteur ? ` · ${s.note_auteur}` : ""}</span>}
      </div>
      <p className="font-medium text-gray-900">{nomStagiaire(s)} <span className="text-gray-400 font-normal">— formatrice {nomFormatrice(s)}</span></p>
      {s.contenu && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{s.contenu}</p>}

      <div className="flex items-center gap-1.5 mt-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setNote(n)}
            className={`w-9 h-9 rounded-lg text-sm font-semibold border ${note === n ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory"}`}>
            {n}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2">1 = très insatisfait · 5 = très satisfait</span>
      </div>
      <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Commentaire (optionnel)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2" />
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <button onClick={enregistrer} disabled={busy} className="mt-2 px-3 py-1.5 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
        {busy ? "Enregistrement…" : s.note != null ? "Mettre à jour" : "Enregistrer"}
      </button>
    </div>
  );
}

export default function PageSatisfaction() {
  const [seances, setSeances] = useState<Seance[]>([]);
  const [resume, setResume] = useState<Resume>({ total: 0, notees: 0, moyenne: null });
  const [agences, setAgences] = useState<string[]>([]);
  const [agence, setAgence] = useState<string>("toutes");
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const q = agence !== "toutes" ? `?agence=${encodeURIComponent(agence)}` : "";
      const r = await fetch(`/api/satisfaction-cours${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setSeances(j.seances); setResume(j.resume);
      if (agence === "toutes") setAgences(j.agences ?? []);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [agence]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Satisfaction à chaud</h1>
          <p className="text-sm text-gray-500 mt-0.5">Évaluation par cours, saisie par l'équipe après chaque séance émargée.</p>
        </div>
      </header>

      {/* Synthèse */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="border border-gray-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-mystory">{resume.moyenne != null ? `${resume.moyenne}/5` : "—"}</p>
          <p className="text-xs text-gray-500 mt-1">Note moyenne</p>
        </div>
        <div className="border border-gray-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{resume.notees}</p>
          <p className="text-xs text-gray-500 mt-1">Séances notées</p>
        </div>
        <div className="border border-gray-200 rounded-xl bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{resume.total}</p>
          <p className="text-xs text-gray-500 mt-1">Séances évaluables</p>
        </div>
      </div>

      {/* Filtre agence */}
      {agences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {["toutes", ...agences].map((a) => (
            <button key={a} onClick={() => setAgence(a)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${agence === a ? "bg-mystory text-white border-mystory" : "bg-white text-gray-700 border-gray-300 hover:border-mystory"}`}>
              {a === "toutes" ? "Toutes agences" : a}
            </button>
          ))}
        </div>
      )}

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : seances.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune séance émargée à évaluer pour l'instant. Les séances apparaissent ici une fois émargées et présentes.</p>
      ) : (
        <div className="space-y-2">
          {seances.map((s) => <LigneSeance key={s.seance_id} s={s} onSaved={charger} />)}
        </div>
      )}
    </main>
  );
}
