"use client";
// app/dossiers/conformite/page.tsx — Scanner de conformité EDOF/Qualiopi (vue d'ensemble des dossiers à risque).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, IdCard, CheckCircle2 } from "lucide-react";

type Anomalie = { code: string; label: string; gravite: "haute" | "moyenne" };
type Risque = { dossierId: string; stagiaire: string; agence: string | null; certif: string; financement: string; anomalies: Anomalie[] };

const LIBELLE_CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

export default function PageConformite() {
  const [dossiers, setDossiers] = useState<Risque[]>([]);
  const [total, setTotal] = useState(0);
  const [hautes, setHautes] = useState(0);
  const [charge, setCharge] = useState(true);

  useEffect(() => {
    fetch("/api/dossiers/conformite-edof", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setDossiers(j.dossiers); setTotal(j.total); setHautes(j.anomalies_hautes); } })
      .finally(() => setCharge(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link href="/dossiers" className="mb-2 inline-flex items-center gap-1 text-sm text-mystory hover:underline"><ArrowLeft size={15} /> Suivi des dossiers</Link>
      <header className="page-header">
        <div>
          <h1 className="page-title">Scanner de conformité</h1>
          <p className="page-subtitle">Les dossiers à corriger avant un contrôle EDOF / Qualiopi, les plus à risque en premier.</p>
        </div>
      </header>

      {charge ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      ) : total === 0 ? (
        <div className="card"><div className="empty-state">
          <CheckCircle2 size={28} strokeWidth={1.75} className="text-success-600" />
          <p className="text-sm font-medium text-gray-700">Aucun dossier à risque détecté</p>
          <p className="text-xs text-gray-400">Tout est conforme.</p>
        </div></div>
      ) : (
        <>
          <div className="mb-5 rounded-2xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-700">
            <strong>{total}</strong> dossier(s) à corriger{hautes > 0 ? <> · <strong>{hautes}</strong> anomalie(s) critique(s)</> : null}.
          </div>
          <div className="space-y-3">
            {dossiers.map((d) => (
              <div key={d.dossierId} className="card">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{d.stagiaire}</span>
                  <span className="badge badge-neutral">{LIBELLE_CERTIF[d.certif] ?? d.certif}</span>
                  {d.agence && <span className="text-xs text-gray-400">{d.agence}</span>}
                  <span className="flex-1" />
                  <a href={`/dossiers/edof?dossier=${d.dossierId}`} className="inline-flex items-center gap-1 text-xs text-mystory hover:underline"><IdCard size={14} /> Fiche EDOF</a>
                </div>
                <ul className="space-y-1 text-sm">
                  {d.anomalies.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={a.gravite === "haute" ? "text-danger-600" : "text-warning-600"}>{a.gravite === "haute" ? "●" : "○"}</span>
                      <span className="text-gray-700">{a.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
