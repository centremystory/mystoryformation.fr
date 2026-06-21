"use client";

/**
 * MYSTORY — Sous-navigation du module Formation (onglets).
 * Les pages Formation sont dans des dossiers séparés : ce composant connaît les familles
 * et affiche les onglets de la famille de la page courante. Inséré via un layout par dossier.
 * Onglets filtrés par rôle (mêmes droits que la barre latérale).
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { peutVoirPage } from "@/lib/roles";

const GROUPES: { cle: string; onglets: { href: string; label: string }[] }[] = [
  { cle: "inscrire", onglets: [
    { href: "/inscriptions/nouvelle", label: "Nouvelle inscription" },
    { href: "/positionnements", label: "Positionnements" },
  ] },
  { cle: "dossiers", onglets: [
    { href: "/dossiers", label: "Tous les dossiers" },
    { href: "/dossiers/conformite", label: "Conformité" },
    { href: "/dossiers/edof", label: "Fiche EDOF" },
    { href: "/edof", label: "Import EDOF" },
  ] },
  { cle: "suivi", onglets: [
    { href: "/emargement", label: "Émargement" },
    { href: "/suivi-eleves", label: "Suivi élèves" },
    { href: "/planning", label: "Planning" },
  ] },
  { cle: "pedagogie", onglets: [
    { href: "/contenu-pedagogique", label: "Espace pédagogique" },
    { href: "/programmes", label: "Séquençage" },
  ] },
];

export default function FormationSousNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => { if (vivant) setRole(j?.ok ? (j.user?.role ?? null) : null); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  const tous = GROUPES.flatMap((g) => g.onglets.map((o) => ({ ...o, cle: g.cle })));
  const actif = tous
    .filter((o) => pathname === o.href || pathname.startsWith(o.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!actif) return null;

  const groupe = GROUPES.find((g) => g.cle === actif.cle)!;
  const onglets = groupe.onglets.filter((o) => peutVoirPage(role, o.href));
  if (onglets.length <= 1) return null;

  return (
    <nav className="border-b border-gray-200 bg-white px-4 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-1">
        {onglets.map((o) => {
          const estActif = o.href === actif.href;
          return (
            <Link key={o.href} href={o.href}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${estActif ? "border-mystory text-mystory" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
              {o.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
