"use client";

/**
 * MYSTORY — Sous-navigation du module Examen (onglets).
 * Regroupe les pages parentes en familles : on choisit la famille dans le menu latéral,
 * puis on navigue entre ses pages via des onglets (au lieu d'avoir 13 entrées de menu).
 * Les onglets sont filtrés selon le rôle (mêmes droits que la barre latérale).
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { peutVoirPage } from "@/lib/roles";

const GROUPES: { cle: string; onglets: { href: string; label: string }[] }[] = [
  { cle: "inscrire", onglets: [
    { href: "/examens/vente-groupe", label: "Inscrire" },
    { href: "/examens/preinscriptions", label: "Par téléphone" },
  ] },
  { cle: "candidats", onglets: [
    { href: "/examens/candidats", label: "Liste" },
    { href: "/examens/croise", label: "Vue croisée" },
  ] },
  { cle: "sessions", onglets: [
    { href: "/examens/sessions", label: "Sessions" },
    { href: "/examens/jour", label: "Jour J" },
    { href: "/examens/liste-attente", label: "Liste d'attente" },
  ] },
  { cle: "resultats", onglets: [
    { href: "/examens/corrections", label: "Corrections" },
    { href: "/examens/taux", label: "Taux de réussite" },
  ] },
];

export default function ExamenSousNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => { if (vivant) setRole(j?.ok ? (j.user?.role ?? null) : null); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  // Onglet actif = href le plus long qui correspond au chemin courant.
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
