// nav: + EDOF
"use client";
// components/NavBar.tsx — Barre de navigation du CRM MYSTORY
// Visible sur toutes les pages internes de l'équipe ; masquée sur la connexion
// et les pages publiques (QCM candidat, pages stagiaires par jeton).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const PAGES_SANS_NAV = ["/connexion", "/qcm", "/positionnement", "/suivi", "/evaluation", "/fiche-besoin", "/emargement/signer", "/satisfaction"];

const LIENS = [
  { href: "/", label: "Accueil" },
  { href: "/dossiers", label: "Dossiers" },
  { href: "/emargement", label: "Émargement" },
  { href: "/examens", label: "Examens" },
  { href: "/factures", label: "Factures" },
  { href: "/classement", label: "Classement" },
  { href: "/edof", label: "EDOF" },
  { href: "/inscriptions/nouvelle", label: "Nouvelle inscription" },
  { href: "/equipe", label: "Équipe" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  if (PAGES_SANS_NAV.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  async function quitter() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    router.push("/connexion");
  }

  return (
    <nav className="bg-mystory text-white">
      <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center gap-1">
        <Link href="/" className="font-semibold tracking-wide mr-4 whitespace-nowrap">
          MYSTORY
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {LIENS.map((l) => {
            const actif = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                  actif ? "bg-white/20 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={quitter}
          className="ml-auto px-3 py-1.5 rounded-md text-sm text-blue-100 hover:bg-white/10 hover:text-white whitespace-nowrap"
        >
          Quitter
        </button>
      </div>
    </nav>
  );
}
