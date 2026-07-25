"use client";
/**
 * MYSTORY — Barre d'onglets générique (fusion de pages liées en un hub).
 * Insérée via un layout de dossier ; l'onglet le plus spécifique qui correspond
 * au chemin courant est actif. Onglets filtrés par rôle + verrou propriétaire
 * (mêmes droits que la barre latérale) ; masquée s'il ne reste qu'un onglet visible.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accesPage } from "@/lib/roles";

export type Onglet = { href: string; label: string };

export default function Onglets({ onglets }: { onglets: Onglet[] }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string[] | string | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => {
      if (!vivant) return;
      setRole(j?.ok ? (j.user?.roles ?? j.user?.role ?? null) : null);
      setEmail(j?.ok ? (j.user?.email ?? null) : null);
    }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  const visibles = onglets.filter((o) => accesPage(role, email, o.href));
  if (visibles.length <= 1) return null;

  const actif = visibles
    .filter((o) => pathname === o.href || pathname.startsWith(o.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-gray-200">
      {visibles.map((o) => (
        <Link key={o.href} href={o.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            o.href === actif ? "border-mystory text-mystory" : "border-transparent text-gray-500 hover:text-gray-800"
          }`}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
