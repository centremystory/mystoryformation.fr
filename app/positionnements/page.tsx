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
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">À noter</h1>
          <p className="page-subtitle">Tests de positionnement terminés par les candidats, en attente des notes d'expression écrite et orale de la formatrice.</p>
        </div>
      </header>

      {erreur && <p className="badge badge-danger mb-4 block w-full !rounded-xl !py-3 text-sm">{erreur}</p>}
      {!liste && !erreur && <p className="text-sm text-gray-400">Chargement…</p>}
      {liste && liste.length === 0 && (
        <div className="card"><div className="empty-state"><p className="text-sm text-gray-500">Aucun test en attente de notation.</p></div></div>
      )}

      <div className="space-y-3">
        {liste?.map((it) => (
          <div key={it.token} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900">{it.civilite ? it.civilite + " " : ""}{it.prenom} {it.nom}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {it.certif === "LEVELTEL" ? "LEVELTEL" : "TEF IRN"}{it.niveau_vise ? ` · visé ${it.niveau_vise}` : ""} · CE {it.ce_sur20 ?? "—"}/20 · CO {it.co_sur10 ?? "—"}/10 · {new Date(it.created_at).toLocaleDateString("fr-FR")}
              </div>
            </div>
            <a href={`/positionnement/${it.token}`} className="btn-primary">Noter</a>
            <button onClick={() => copier(it.token)} className="btn-ghost">
              {copie === it.token ? "Lien copié ✓" : "Copier le lien"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
