"use client";
// components/NavBar.tsx — Barre de navigation du CRM MYSTORY (architecture 2 espaces)
// 6 entrées : Accueil · Formation · Examen · Factures · BPF · Équipe.
// La navigation fine se fait dans les pages hub /formation et /examen (fini les boutons éparpillés).
// Masquée sur la connexion et les pages publiques (QCM candidat, pages stagiaires par jeton).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const PAGES_SANS_NAV = ["/connexion", "/qcm", "/positionnement", "/suivi", "/evaluation", "/fiche-besoin", "/emargement/signer", "/satisfaction"];

const LIENS = [
  { href: "/", label: "Accueil" },
  { href: "/formation", label: "🎓 Formation" },
  { href: "/examen", label: "📝 Examen" },
  { href: "/factures", label: "Factures" },
  { href: "/bpf", label: "BPF" },
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
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/embleme-blanc.png" alt="MYSTORY" className="h-8 w-auto" />
          <span className="font-semibold tracking-wide whitespace-nowrap">MYSTORY</span>
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
