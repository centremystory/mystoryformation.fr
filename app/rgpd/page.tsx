"use client";
// app/rgpd/page.tsx — Purge RGPD post-rétention (direction)
// Liste les candidats (stagiaires : 5 ans après le dernier dossier ; prospects : 3 ans sans suite)
// et permet l'anonymisation au clic, avec confirmation. Rien d'automatique, tout est tracé au journal.
import { useEffect, useState } from "react";

type Candidat = { type: "stagiaire" | "prospect"; id: string; libelle: string; date_ref: string };

export default function RgpdPage() {
  const [candidats, setCandidats] = useState<Candidat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function charger() {
    setErreur(null);
    const r = await fetch("/api/rgpd/purge");
    const j = await r.json();
    if (!r.ok) { setErreur(j.error ?? "Erreur"); setCandidats([]); return; }
    setCandidats(j.candidats ?? []);
  }
  useEffect(() => { charger(); }, []);

  async function anonymiser(c: Candidat) {
    const ok = window.confirm(
      `Anonymiser définitivement ?\n\n${c.libelle}\n\n• Identité et coordonnées effacées\n• Documents PDF supprimés du stockage (stagiaires)\n• Factures conservées (obligation comptable 10 ans)\n• Action tracée au journal — IRRÉVERSIBLE`
    );
    if (!ok) return;
    setBusy(c.id); setInfo(null); setErreur(null);
    const r = await fetch("/api/rgpd/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: c.type, id: c.id }),
    });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) { setErreur(j.error ?? "Refusé"); return; }
    setInfo(`Anonymisé ✔ (${j.fichiers_supprimes ?? 0} document(s) supprimé(s) du stockage)`);
    charger();
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">RGPD — purge de fin de rétention</h1>
      <p className="mt-1 text-sm text-gray-500">
        Anonymisation (jamais de suppression de lignes) des personnes dont la durée de conservation est
        échue : <strong>stagiaires</strong> 5 ans après la clôture du dernier dossier, <strong>prospects</strong> 3 ans
        après le dernier contact. Les factures restent intactes 10 ans (obligation comptable). Chaque action
        est tracée au journal.
      </p>

      {erreur && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{erreur}</div>}
      {info && <div className="mt-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2">{info}</div>}

      <div className="mt-5 rounded-xl border border-gray-200 bg-white">
        {candidats === null ? (
          <p className="p-5 text-sm text-gray-400">Chargement…</p>
        ) : candidats.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">
            ✅ Aucune donnée en fin de rétention aujourd'hui. Revenez vérifier régulièrement (une fois par
            trimestre) — les premiers dossiers arriveront à échéance 5 ans après leur clôture.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {candidats.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <span className={`inline-block text-[11px] font-bold uppercase rounded px-1.5 py-0.5 mr-2 ${c.type === "stagiaire" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                    {c.type}
                  </span>
                  <span className="text-sm text-gray-800">{c.libelle}</span>
                </div>
                <button
                  onClick={() => anonymiser(c)}
                  disabled={busy === c.id}
                  className="shrink-0 rounded-lg bg-red-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                >
                  {busy === c.id ? "…" : "Anonymiser"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-gray-600 leading-relaxed">
        <strong className="text-gray-800">Procédure (à conserver) :</strong> 1) vérifier cette page chaque
        trimestre ; 2) pour chaque personne listée, contrôler qu'aucune procédure en cours (litige, contrôle
        CDC/Qualiopi) ne justifie une prolongation — dans ce cas, ne pas purger et documenter le motif ;
        3) cliquer « Anonymiser » ; 4) l'action efface identité, coordonnées et documents du stockage, et
        s'inscrit au journal. Registre des traitements : ce mécanisme correspond aux durées T1–T7.
      </div>
    </main>
  );
}
