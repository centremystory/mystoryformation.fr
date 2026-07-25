"use client";
/**
 * MYSTORY — Bandeau « rituel du jour » : selon l'heure de Paris (matin / début d'aprem),
 * rappelle les priorités (leads, dossiers, +rapport hebdo le vendredi) et affiche un
 * message de motivation généré par l'IA (mis en cache 1×/créneau côté serveur).
 * Le soir, il ne s'affiche pas.
 */
import { useEffect, useState } from "react";

function heureParis(): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()));
}
function estVendredi(): boolean {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "long" }).format(new Date()).toLowerCase() === "friday";
}

export default function RituelDuJour() {
  const [motiv, setMotiv] = useState("");
  const h = heureParis();
  const creneau: "matin" | "aprem" | null = h >= 6 && h < 13 ? "matin" : h >= 13 && h < 19 ? "aprem" : null;

  useEffect(() => {
    if (!creneau) return;
    let vivant = true;
    fetch(`/api/motivation?creneau=${creneau}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivant && j?.ok) setMotiv(j.message); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [creneau]);

  if (!creneau) return null;
  const vendredi = estVendredi();
  const rappels = creneau === "matin" ? ["fais tes leads", "avance tes dossiers"] : ["relance tes leads", "finalise les dossiers du jour"];
  if (vendredi) rappels.push("remplis ton rapport hebdo");
  const emoji = creneau === "matin" ? "☀️" : "🚀";
  const salut = creneau === "matin" ? "Bonjour !" : "On repart !";

  return (
    <div className="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white px-4 py-3">
      <div className="text-sm font-semibold text-blue-900">{emoji} {salut} {motiv}</div>
      <div className="mt-1 text-sm text-gray-600">
        Aujourd'hui : {rappels.map((r, i) => <span key={i}>{i > 0 ? " · " : ""}<b className="text-gray-800">{r}</b></span>)}
      </div>
    </div>
  );
}
