"use client";
/**
 * MYSTORY — Bandeau « réclamations à traiter » (candidats).
 * Visible en haut de chaque page tant qu'il reste des réclamations non résolues
 * (exigence Qualiopi : les traiter). Rafraîchi toutes les 3 minutes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";

type Etat = { total: number; urgentes: number; apercu: string[] };

export default function ReclamationsAlerte() {
  const [data, setData] = useState<Etat | null>(null);

  useEffect(() => {
    let vivant = true;
    const charger = () =>
      fetch("/api/reclamations/ouvertes", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (vivant && j?.ok) setData(j); })
        .catch(() => {});
    charger();
    const t = setInterval(charger, 180_000);
    return () => { vivant = false; clearInterval(t); };
  }, []);

  if (!data || data.total === 0) return null;
  const apercu = data.apercu.join(" · ");

  return (
    <Link href="/reclamations" className="mb-4 block no-underline">
      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-orange-800">
        <MessageSquareWarning size={18} />
        <span className="text-sm font-semibold">
          {data.total} réclamation{data.total > 1 ? "s" : ""} à traiter{data.urgentes > 0 ? ` · ${data.urgentes} prioritaire${data.urgentes > 1 ? "s" : ""}` : ""}
        </span>
        {apercu && <span className="hidden truncate text-sm opacity-80 sm:inline">— {apercu}</span>}
        <span className="ml-auto whitespace-nowrap text-sm font-medium opacity-90">Traiter →</span>
      </div>
    </Link>
  );
}
