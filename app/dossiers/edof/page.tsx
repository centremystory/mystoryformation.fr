"use client";
// app/dossiers/edof/page.tsx — Fiche EDOF pré-remplie (valeurs à recopier dans Mon Compte Formation).
import { useEffect, useState } from "react";
import Link from "next/link";

type Champ = { label: string; valeur: string; copiable: boolean; vide?: boolean };
type Controle = { label: string; ok: boolean; detail: string };
type Fiche = { dossierId: string; stagiaire: { nom: string; prenom: string }; financement: string; champs: Champ[]; controles: Controle[]; rappels: string[] };

export default function PageFicheEdof() {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("dossier");
    if (!id) { setErreur("Aucun dossier indiqué."); return; }
    fetch(`/api/dossiers/fiche-edof?dossier=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setFiche(j); else setErreur(j.erreur || "Erreur."); })
      .catch(() => setErreur("Erreur de chargement."));
  }, []);

  async function copier(label: string, valeur: string) {
    try { await navigator.clipboard.writeText(valeur); setCopie(label); setTimeout(() => setCopie(null), 1200); } catch { /* ignore */ }
  }

  if (erreur) return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-red-600 text-sm">{erreur}</p><Link href="/dossiers" className="text-mystory underline text-sm">← Retour</Link></main>;
  if (!fiche) return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-gray-500 text-sm">Chargement…</p></main>;

  return (
    <main className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <Link href="/dossiers" className="text-mystory underline text-sm">← Suivi des dossiers</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-1">Fiche EDOF — {fiche.stagiaire.prenom} {fiche.stagiaire.nom}</h1>
      <p className="text-sm text-gray-500 mb-5">Valeurs à recopier dans Mon Compte Formation ({fiche.financement}). EDOF n'a pas d'API : la saisie reste manuelle, mais tout est prêt ici.</p>

      {/* Contrôles */}
      <div className="border border-gray-200 rounded-xl bg-white p-4 mb-5">
        <p className="font-medium text-gray-800 mb-2">Contrôles de conformité</p>
        <ul className="space-y-1.5 text-sm">
          {fiche.controles.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
              <span><span className="text-gray-800">{c.label}</span> — <span className="text-gray-500">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {/* Champs à recopier */}
      <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100 mb-5">
        {fiche.champs.map((ch, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-44 shrink-0 text-xs text-gray-500">{ch.label}</div>
            <div className={`flex-1 text-sm ${ch.vide ? "text-amber-600 italic" : "text-gray-900"}`}>
              {ch.vide ? "à compléter" : (ch.valeur || "—")}
            </div>
            {ch.copiable && ch.valeur && !ch.vide && (
              <button onClick={() => copier(ch.label, ch.valeur)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:border-mystory hover:text-mystory">
                {copie === ch.label ? "Copié ✓" : "Copier"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Rappels */}
      <div className="text-xs text-gray-500 space-y-1">
        {fiche.rappels.map((r, i) => <p key={i}>• {r}</p>)}
      </div>
    </main>
  );
}
