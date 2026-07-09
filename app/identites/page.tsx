"use client";
/**
 * MYSTORY — /identites : suivi des vérifications d'identité de tous ceux qui passent au bureau.
 * Filtres : À suivre (démarche en cours) / Validés / Non renseignés / Tous.
 * Édition directe : statut + note (enregistrées via PATCH /api/fiche/[id], journalisé).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IDENTITE_STATUTS, IDENTITE_LABEL, identiteBadge } from "@/lib/identite";

type Ligne = {
  id: string; civilite: string | null; nom: string; prenom: string | null;
  email: string | null; telephone: string | null; agence: string | null;
  verification_identite: string | null; verification_identite_note: string | null;
  verification_identite_maj_le: string | null; verification_identite_auteur: string | null;
};

const FILTRES = [
  { id: "a_suivre", label: "🟠 À suivre" },
  { id: "valides", label: "🟢 Validés" },
  { id: "non_renseignes", label: "⚪ Non renseignés" },
  { id: "tous", label: "Tous" },
] as const;

function Rangee({ s, onMaj }: { s: Ligne; onMaj: () => void }) {
  const [statut, setStatut] = useState(s.verification_identite ?? "");
  const [note, setNote] = useState(s.verification_identite_note ?? "");
  const [envoi, setEnvoi] = useState(false);
  const badge = identiteBadge(s.verification_identite);
  const modif = statut !== (s.verification_identite ?? "") || note !== (s.verification_identite_note ?? "");

  async function enregistrer() {
    setEnvoi(true);
    try {
      const r = await fetch(`/api/fiche/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_identite: statut || null, verification_identite_note: note || null }),
      });
      const j = await r.json();
      if (j.ok) onMaj(); else alert(j.erreur ?? "Enregistrement impossible.");
    } catch { alert("Erreur réseau."); }
    finally { setEnvoi(false); }
  }

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/fiche/${s.id}`} className="font-medium text-gray-900 hover:underline">
          {s.prenom ?? ""} {s.nom}
        </Link>
        {s.agence && <span className="badge" style={{ background: "#EAF1FC", color: "#2F72DE" }}>{s.agence}</span>}
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className="ml-auto text-xs text-gray-400">
          {s.verification_identite_maj_le ? `maj ${new Date(s.verification_identite_maj_le).toLocaleDateString("fr-FR")}` : ""}
          {s.verification_identite_auteur ? ` · ${s.verification_identite_auteur}` : ""}
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500">{[s.telephone, s.email].filter(Boolean).join(" · ") || "Pas de coordonnées"}</div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select value={statut} onChange={(e) => setStatut(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm sm:w-64">
          <option value="">— Non renseigné —</option>
          {IDENTITE_STATUTS.map((v) => <option key={v} value={v}>{IDENTITE_LABEL[v]}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
          placeholder="Note de suivi…"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm" />
        <button onClick={enregistrer} disabled={envoi || !modif}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${modif ? "bg-mystory hover:opacity-90" : "bg-gray-300"}`}>
          {envoi ? "…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

export default function IdentitesPage() {
  const [filtre, setFiltre] = useState<string>("a_suivre");
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setLignes(null);
    fetch(`/api/identites?filtre=${filtre}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setLignes(j.stagiaires) : setErreur(j.erreur ?? "Erreur")))
      .catch(() => setErreur("Chargement impossible."));
  }, [filtre]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vérifications d&apos;identité</h1>
          <p className="page-subtitle">Suivi de tous ceux qui passent au bureau : identité numérique, courrier, vérification en ligne.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTRES.map((f) => (
          <button key={f.id} onClick={() => setFiltre(f.id)}
            className={`rounded-full border px-3 py-1 text-sm ${filtre === f.id ? "border-mystory bg-mystory text-white" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {erreur && <div className="card p-4 text-red-600">{erreur}</div>}
      {!erreur && lignes === null && <div className="p-4 text-gray-400">Chargement…</div>}
      {lignes !== null && lignes.length === 0 && (
        <div className="empty-state text-sm text-gray-400">
          {filtre === "a_suivre" ? "Aucune démarche d'identité en attente — tout est à jour. 🎉" : "Aucun stagiaire dans ce filtre."}
        </div>
      )}
      {lignes !== null && lignes.map((s) => <Rangee key={s.id} s={s} onMaj={charger} />)}
    </main>
  );
}
