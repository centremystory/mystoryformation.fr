"use client";
/**
 * MYSTORY — Bandeau « conformité : dossiers à corriger avant contrôle ».
 * Rend visible le scanner de conformité EDOF/Qualiopi (sinon personne ne le consulte).
 * Affiché tant qu'il reste des dossiers à risque. Rafraîchi toutes les 5 minutes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

type Etat = { total: number; anomalies_hautes: number };

export default function ConformiteAlerte() {
  const [data, setData] = useState<Etat | null>(null);

  useEffect(() => {
    let vivant = true;
    const charger = () =>
      fetch("/api/dossiers/conformite-edof", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (vivant && j?.ok) setData(j); })
        .catch(() => {});
    charger();
    const t = setInterval(charger, 300_000);
    return () => { vivant = false; clearInterval(t); };
  }, []);

  if (!data || data.total === 0) return null;

  return (
    <Link href="/dossiers/conformite" className="mb-4 block no-underline">
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-red-800">
        <ShieldAlert size={18} />
        <span className="text-sm font-semibold">
          {data.total} dossier{data.total > 1 ? "s" : ""} à corriger avant contrôle
          {data.anomalies_hautes > 0 ? ` · ${data.anomalies_hautes} anomalie${data.anomalies_hautes > 1 ? "s" : ""} critique${data.anomalies_hautes > 1 ? "s" : ""}` : ""}
        </span>
        <span className="ml-auto whitespace-nowrap text-sm font-medium opacity-90">Scanner →</span>
      </div>
    </Link>
  );
}
