"use client";
/**
 * MYSTORY — Bandeau « tâches à traiter » de l'utilisateur courant.
 * Affiché en haut de chaque page (via AppShell). Rouge s'il y a des tâches urgentes
 * (échéance passée / sans date). Se rafraîchit toutes les 2 minutes.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ListTodo } from "lucide-react";

type Etat = { total: number; urgentes: number; taches: { titre: string; agence: string; urgente: boolean; mienne: boolean }[] };

export default function TachesUrgentes() {
  const [data, setData] = useState<Etat | null>(null);

  useEffect(() => {
    let vivant = true;
    const charger = () =>
      fetch("/api/taches/mes", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (vivant && j?.ok) setData(j); })
        .catch(() => {});
    charger();
    const t = setInterval(charger, 120_000);
    return () => { vivant = false; clearInterval(t); };
  }, []);

  if (!data || data.total === 0) return null;
  const urgent = data.urgentes > 0;
  const apercu = data.taches.slice(0, 3).map((t) => t.titre).join(" · ");

  return (
    <Link href="/taches" className="mb-4 block no-underline">
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
        urgent ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"
      }`}>
        {urgent ? <AlertTriangle size={18} /> : <ListTodo size={18} />}
        <span className="text-sm font-semibold">
          {data.total} tâche{data.total > 1 ? "s" : ""} à traiter{urgent ? ` · ${data.urgentes} urgente${data.urgentes > 1 ? "s" : ""}` : ""}
        </span>
        {apercu && <span className="hidden truncate text-sm opacity-80 sm:inline">— {apercu}</span>}
        <span className="ml-auto whitespace-nowrap text-sm font-medium opacity-90">Voir →</span>
      </div>
    </Link>
  );
}
