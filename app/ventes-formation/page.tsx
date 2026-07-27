"use client";
// app/ventes-formation/page.tsx — Liste opérationnelle des ventes de formation (Sheet importé).
// Filtres agence / statut / vendeur + recherche. Montants réservés au propriétaire (verrou finance).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SITES } from "@/lib/sites";

const BLEU = "#2F72DE";
type Vente = {
  id: string; date_inscription: string | null; agence: string | null; formule: string | null; heures: number | null;
  nom: string; email: string | null; telephone: string | null; vendeur: string | null; statut: string | null;
  fond_propre: boolean | null; commentaire: string | null; href: string | null; montant: number | null;
};

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const p = iso.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
const euro = (n: number | null) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} €`);

export default function VentesFormationPage() {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [voitMontants, setVoitMontants] = useState(false);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fAgence, setFAgence] = useState("toutes");
  const [fStatut, setFStatut] = useState("tous");
  const [fVendeur, setFVendeur] = useState("tous");
  const [nbAffiche, setNbAffiche] = useState(100);

  useEffect(() => {
    (async () => {
      setCharge(true); setErreur(null);
      try {
        const r = await fetch("/api/ventes-formation", { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erreur || "Chargement impossible.");
        setVentes(j.ventes); setVoitMontants(j.voitMontants);
      } catch (e: any) { setErreur(e?.message || "Chargement impossible."); }
      finally { setCharge(false); }
    })();
  }, []);

  const statuts = useMemo(() => [...new Set(ventes.map((v) => v.statut).filter(Boolean))] as string[], [ventes]);
  const vendeurs = useMemo(() => [...new Set(ventes.map((v) => v.vendeur).filter(Boolean))].sort() as string[], [ventes]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ventes.filter((v) => {
      if (fAgence !== "toutes" && (v.agence ?? "") !== fAgence) return false;
      if (fStatut !== "tous" && (v.statut ?? "") !== fStatut) return false;
      if (fVendeur !== "tous" && (v.vendeur ?? "") !== fVendeur) return false;
      if (t && !`${v.nom} ${v.email ?? ""} ${v.formule ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [ventes, q, fAgence, fStatut, fVendeur]);

  const totalMontant = useMemo(
    () => (voitMontants ? visibles.reduce((s, v) => s + (Number(v.montant) || 0), 0) : 0),
    [visibles, voitMontants]
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="page-header">
        <h1 className="page-title">Ventes formation</h1>
        <p className="page-subtitle">Suivi commercial des ventes de formation (source : suivi de ventes). Cliquez un client pour ouvrir sa fiche.</p>
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, email, formule)…" className="input flex-1 min-w-[200px]" />
        <select value={fAgence} onChange={(e) => setFAgence(e.target.value)} className="input">
          <option value="toutes">Toutes agences</option>
          {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} className="input">
          <option value="tous">Tous statuts</option>
          {statuts.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fVendeur} onChange={(e) => setFVendeur(e.target.value)} className="input">
          <option value="tous">Tous vendeurs</option>
          {vendeurs.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {charge ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
      ) : erreur ? (
        <div className="empty-state text-red-600">{erreur}</div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span><strong className="text-gray-800">{visibles.length}</strong> vente{visibles.length > 1 ? "s" : ""}</span>
            {voitMontants && <span>· total <strong style={{ color: BLEU }}>{euro(totalMontant)}</strong></span>}
          </div>
          <div className="card overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Formule</th>
                  <th className="px-3 py-2">Heures</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Vendeur</th>
                  <th className="px-3 py-2">Agence</th>
                  {voitMontants && <th className="px-3 py-2">Montant</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, nbAffiche).map((v) => (
                  <tr key={v.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{dateFr(v.date_inscription)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {v.href ? <Link href={v.href} className="hover:underline" style={{ color: BLEU }}>{v.nom}</Link> : v.nom}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{v.formule ?? "—"}{v.fond_propre ? <span className="ml-1 badge bg-gray-100 text-gray-500">fonds propres</span> : null}</td>
                    <td className="px-3 py-2 text-gray-600">{v.heures ?? "—"} h</td>
                    <td className="px-3 py-2 text-gray-600">{v.statut ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{v.vendeur ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{v.agence ?? "—"}</td>
                    {voitMontants && <td className="px-3 py-2 text-gray-700">{euro(v.montant)}</td>}
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={voitMontants ? 8 : 7} className="px-3 py-6 text-center text-gray-400">Aucune vente ne correspond aux filtres.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {visibles.length > nbAffiche && (
            <div className="mt-3 text-center">
              <button onClick={() => setNbAffiche((n) => n + 100)} className="btn-ghost !text-sm">
                Afficher plus ({visibles.length - nbAffiche} restantes sur {visibles.length})
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
