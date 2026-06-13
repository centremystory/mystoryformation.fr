"use client";

/**
 * MYSTORY — Liste « À noter » : positionnements candidats en attente de notation EE/EO.
 * Page d'équipe (authentifiée par le middleware). Permet d'ouvrir ou de copier le lien
 * de notation à envoyer à la formatrice.
 */
import { useEffect, useState } from "react";

type Item = {
  token: string; civilite: string | null; nom: string; prenom: string;
  certif: string; niveau_vise: string | null; ce_sur20: number | null; co_sur10: number | null; created_at: string;
};

export default function AListe() {
  const [liste, setListe] = useState<Item[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/positionnements")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setListe(j.liste); else setErreur(j.erreur || "Erreur."); })
      .catch(() => setErreur("Chargement impossible."));
  }, []);

  function lien(token: string) { return `${window.location.origin}/positionnement/${token}`; }
  async function copier(token: string) {
    try { await navigator.clipboard.writeText(lien(token)); setCopie(token); setTimeout(() => setCopie(null), 1800); }
    catch { setCopie(null); }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold text-gray-900">À noter</h1>
      <p className="mt-1 text-sm text-gray-500">Tests de positionnement terminés par les candidats, en attente des notes d'expression écrite et orale de la formatrice.</p>

      {erreur && <p className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{erreur}</p>}
      {!liste && !erreur && <p className="mt-6 text-sm text-gray-400">Chargement…</p>}
      {liste && liste.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Aucun test en attente de notation.</p>}

      <div className="mt-4 space-y-3">
        {liste?.map((it) => (
          <div key={it.token} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900">{it.civilite ? it.civilite + " " : ""}{it.prenom} {it.nom}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {it.certif === "LEVELTEL" ? "LEVELTEL" : "TEF IRN"}{it.niveau_vise ? ` · visé ${it.niveau_vise}` : ""} · CE {it.ce_sur20 ?? "—"}/20 · CO {it.co_sur10 ?? "—"}/10 · {new Date(it.created_at).toLocaleDateString("fr-FR")}
              </div>
            </div>
            <a href={`/positionnement/${it.token}`} className="rounded-lg bg-mystory px-3 py-2 text-sm font-semibold text-white">Noter</a>
            <button onClick={() => copier(it.token)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {copie === it.token ? "Lien copié ✓" : "Copier le lien"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
