"use client";
// app/cockpit-commercial/page.tsx — Cockpit commercial par vendeur (formations + examens).
// Volumes + items à relancer (à confirmer / impayés / non inscrits CCI). Montants owner-only.
import { useEffect, useState } from "react";
import Link from "next/link";

const BLEU = "#2F72DE";
type Ligne = {
  vendeur: string; formations: number; examens: number;
  aConfirmer: number; impayes: number; nonInscritCci: number; montant: number | null;
};
type Totaux = {
  vendeurs: number; formations: number; formationsARelancer: number; examens: number;
  aConfirmer: number; impayes: number; nonInscritCci: number; montant: number | null;
};
const euro = (n: number | null) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} €`);

function Kpi({ label, valeur, accent, href }: { label: string; valeur: number | string; accent?: boolean; href?: string }) {
  const contenu = (
    <>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-amber-700" : "text-gray-900"}`}>{valeur}</p>
    </>
  );
  // Cliquable seulement s'il y a des items à relancer → drill-down vers la liste filtrée.
  return href && Number(valeur) > 0
    ? <Link href={href} className="card block p-3 transition hover:border-mystory hover:shadow-sm">{contenu}<span className="mt-1 block text-xs text-mystory">Voir la liste →</span></Link>
    : <div className="card p-3">{contenu}</div>;
}

export default function CockpitCommercialPage() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [totaux, setTotaux] = useState<Totaux | null>(null);
  const [voitMontants, setVoitMontants] = useState(false);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCharge(true); setErreur(null);
      try {
        const r = await fetch("/api/cockpit-commercial", { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erreur || "Chargement impossible.");
        setLignes(j.lignes); setTotaux(j.totaux); setVoitMontants(j.voitMontants);
      } catch (e: any) { setErreur(e?.message || "Chargement impossible."); }
      finally { setCharge(false); }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="page-header">
        <h1 className="page-title">Cockpit commercial</h1>
        <p className="page-subtitle">Activité par vendeur (formations + examens) et ce qui reste à relancer.</p>
      </div>

      {charge ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : erreur ? (
        <div className="empty-state text-red-600">{erreur}</div>
      ) : totaux && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Vendeurs actifs" valeur={totaux.vendeurs} />
            <Kpi label="Formations à relancer" valeur={totaux.formationsARelancer} accent={totaux.formationsARelancer > 0} href="/ventes-formation?relance=impaye" />
            <Kpi label="Examens à confirmer" valeur={totaux.aConfirmer} accent={totaux.aConfirmer > 0} href="/examens/candidats?relance=confirmer" />
            <Kpi label="Examens impayés" valeur={totaux.impayes} accent={totaux.impayes > 0} href="/examens/candidats?relance=impaye" />
            <Kpi label="Non inscrits CCI" valeur={totaux.nonInscritCci} accent={totaux.nonInscritCci > 0} href="/examens/candidats?relance=cci" />
          </div>

          <div className="card overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">Vendeur</th>
                  <th className="px-3 py-2">Formations</th>
                  <th className="px-3 py-2">Examens</th>
                  <th className="px-3 py-2">À confirmer</th>
                  <th className="px-3 py-2">Impayés</th>
                  <th className="px-3 py-2">Non inscrits CCI</th>
                  {voitMontants && <th className="px-3 py-2">CA</th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.vendeur} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{l.vendeur}</td>
                    <td className="px-3 py-2 text-gray-600">{l.formations}</td>
                    <td className="px-3 py-2 text-gray-600">{l.examens}</td>
                    <td className={`px-3 py-2 ${l.aConfirmer > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}>{l.aConfirmer || "—"}</td>
                    <td className={`px-3 py-2 ${l.impayes > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}>{l.impayes || "—"}</td>
                    <td className={`px-3 py-2 ${l.nonInscritCci > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}>{l.nonInscritCci || "—"}</td>
                    {voitMontants && <td className="px-3 py-2 font-medium" style={{ color: BLEU }}>{euro(l.montant)}</td>}
                  </tr>
                ))}
                {lignes.length === 0 && (
                  <tr><td colSpan={voitMontants ? 7 : 6} className="px-3 py-6 text-center text-gray-400">Aucune vente enregistrée.</td></tr>
                )}
              </tbody>
              {voitMontants && lignes.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2">{totaux.formations}</td>
                    <td className="px-3 py-2">{totaux.examens}</td>
                    <td className="px-3 py-2">{totaux.aConfirmer}</td>
                    <td className="px-3 py-2">{totaux.impayes}</td>
                    <td className="px-3 py-2">{totaux.nonInscritCci}</td>
                    <td className="px-3 py-2" style={{ color: BLEU }}>{euro(totaux.montant)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            « À relancer » : examens à confirmer, avec reste à payer, ou pas encore inscrits à la CCI.
            {voitMontants ? "" : " Les montants sont réservés à la direction."}
          </p>
        </>
      )}
    </main>
  );
}
