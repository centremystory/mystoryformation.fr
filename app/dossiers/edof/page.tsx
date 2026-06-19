"use client";
// app/dossiers/edof/page.tsx — Fiche EDOF pré-remplie (valeurs à recopier dans Mon Compte Formation).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";

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

  if (erreur) return <main className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-danger-600">{erreur}</p><Link href="/dossiers" className="text-sm text-mystory hover:underline">← Retour</Link></main>;
  if (!fiche) return <main className="mx-auto max-w-2xl px-4 py-8"><div className="skeleton h-40" /></main>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <Link href="/dossiers" className="mb-2 inline-flex items-center gap-1 text-sm text-mystory hover:underline"><ArrowLeft size={15} /> Suivi des dossiers</Link>
      <header className="page-header">
        <div>
          <h1 className="page-title">Fiche EDOF — {fiche.stagiaire.prenom} {fiche.stagiaire.nom}</h1>
          <p className="page-subtitle">Valeurs à recopier dans Mon Compte Formation ({fiche.financement}). EDOF n'a pas d'API : la saisie reste manuelle, mais tout est prêt ici.</p>
        </div>
      </header>

      {/* Contrôles */}
      <div className="card mb-5">
        <p className="mb-2 font-medium text-gray-800">Contrôles de conformité</p>
        <ul className="space-y-1.5 text-sm">
          {fiche.controles.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={c.ok ? "text-success-600" : "text-danger-600"}>{c.ok ? <Check size={15} /> : <X size={15} />}</span>
              <span><span className="text-gray-800">{c.label}</span> — <span className="text-gray-500">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {/* Champs à recopier */}
      <div className="card mb-5 divide-y divide-gray-100 !p-0">
        {fiche.champs.map((ch, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-44 shrink-0 text-xs text-gray-500">{ch.label}</div>
            <div className={`flex-1 text-sm ${ch.vide ? "italic text-warning-600" : "text-gray-900"}`}>
              {ch.vide ? "à compléter" : (ch.valeur || "—")}
            </div>
            {ch.copiable && ch.valeur && !ch.vide && (
              <button onClick={() => copier(ch.label, ch.valeur)}
                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition hover:border-mystory hover:text-mystory">
                {copie === ch.label ? "Copié ✓" : "Copier"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Rappels */}
      <div className="space-y-1 text-xs text-gray-500">
        {fiche.rappels.map((r, i) => <p key={i}>• {r}</p>)}
      </div>
    </main>
  );
}
