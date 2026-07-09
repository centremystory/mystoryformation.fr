"use client";
// components/NavBar.tsx — Navigation regroupée du CRM MYSTORY.
// Entrées de haut niveau (Accueil · Rechercher · Formation · Examen · RH · Finance · Conformité · Admin) ; les groupes ouvrent une sous-barre (robuste mobile, pas de menu coupé).
// Masquée sur la connexion et les pages publiques (QCM candidat, pages stagiaires par jeton).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { peutVoirPage } from "@/lib/roles";
import { SITES, COOKIE_SITE, siteValide } from "@/lib/sites";

const PAGES_SANS_NAV = ["/connexion", "/qcm", "/positionnement", "/suivi", "/evaluation", "/fiche-besoin", "/emargement/signer", "/satisfaction", "/formateur-questionnaire", "/contact", "/partenaire"];

type Lien = { href: string; label: string };
type Entree = { type: "link"; href: string; label: string } | { type: "menu"; label: string; items: Lien[] };

const NAV: Entree[] = [
  { type: "link", href: "/", label: "Accueil" },
  { type: "link", href: "/recherche", label: "🔎 Rechercher" },
  {
    type: "menu", label: "🎓 Formation", items: [
      { href: "/formation", label: "Espace Formation" },
      { href: "/identites", label: "Identités" },
      { href: "/calendrier", label: "Calendrier" },
      { href: "/satisfaction-cours", label: "Satisfaction" },
      { href: "/contenu-pedagogique", label: "Pédagogie" },
      { href: "/programmes", label: "Séquençage" },
    ],
  },
  { type: "link", href: "/examen", label: "📝 Examen" },
  {
    type: "menu", label: "RH", items: [
      { href: "/conges", label: "Congés" },
      { href: "/planning-employes", label: "Planning équipe" },
      { href: "/pointage", label: "Pointage" },
    ],
  },
  {
    type: "menu", label: "Finance", items: [
      { href: "/factures", label: "Factures" },
      { href: "/attestations-paiement", label: "Attestation de paiement" },
      { href: "/validations", label: "Validations" },
      { href: "/bpf", label: "BPF" },
    ],
  },
  {
    type: "menu", label: "Conformité", items: [
      { href: "/reclamations", label: "Réclamations" },
      { href: "/anomalies", label: "Anomalies" },
      { href: "/incidents", label: "Incidents" },
      { href: "/veille", label: "Veille" },
      { href: "/journal", label: "Journal" },
    ],
  },
  {
    type: "menu", label: "Admin", items: [
      { href: "/equipe", label: "Équipe" },
      { href: "/formateurs", label: "Formateurs" },
      { href: "/comptes", label: "Comptes" },
      { href: "/automatisations", label: "Automatisations" },
      { href: "/messages", label: "Messages" },
      { href: "/faq", label: "FAQ & Guides" },
    ],
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [site, setSite] = useState<string>("");

  // Site courant lu depuis le cookie (filtre global, lentille interne — jamais le lieu des documents).
  useEffect(() => {
    const m = document.cookie.split("; ").find((c) => c.startsWith(COOKIE_SITE + "="));
    setSite(siteValide(m ? decodeURIComponent(m.split("=").slice(1).join("=")) : ""));
  }, []);

  function changerSite(v: string) {
    const val = siteValide(v);
    document.cookie = `${COOKIE_SITE}=${encodeURIComponent(val)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setSite(val);
    window.location.reload(); // recharge : compteurs serveur + listes client repassent par le cookie
  }

  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => { if (vivant) setRole(j?.ok ? (j.user?.role ?? null) : null); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  // NAV filtrée selon le rôle (rôle inconnu/"staff" = tout visible, filet de transition).
  const navVisible = NAV
    .map((e) => (e.type === "menu" ? { ...e, items: e.items.filter((i) => peutVoirPage(role, i.href)) } : e))
    .filter((e) => (e.type === "link" ? peutVoirPage(role, e.href) : e.items.length > 0));

  if (PAGES_SANS_NAV.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const estActif = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const groupeActif = (items: Lien[]) => items.some((i) => estActif(i.href));

  async function quitter() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    router.push("/connexion");
  }

  const groupeOuvert = navVisible.find((e) => e.type === "menu" && e.label === ouvert) as Extract<Entree, { type: "menu" }> | undefined;

  return (
    <nav className="bg-mystory text-white">
      <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center gap-1">
        <Link href="/" onClick={() => setOuvert(null)} className="flex items-center gap-2 mr-3 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/embleme-blanc.png" alt="MYSTORY" className="h-8 w-auto" />
          <span className="font-semibold tracking-wide whitespace-nowrap">MYSTORY</span>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          {navVisible.map((e) => {
            if (e.type === "link") {
              const actif = estActif(e.href);
              return (
                <Link key={e.href} href={e.href} onClick={() => setOuvert(null)}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${actif ? "bg-white/20 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
                  {e.label}
                </Link>
              );
            }
            const actif = groupeActif(e.items) || ouvert === e.label;
            return (
              <button key={e.label} onClick={() => setOuvert((o) => (o === e.label ? null : e.label))}
                className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${actif ? "bg-white/20 text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
                {e.label} <span className="text-xs">{ouvert === e.label ? "▴" : "▾"}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={site}
            onChange={(e) => changerSite(e.target.value)}
            aria-label="Filtrer par site"
            className="px-2 py-1.5 rounded-md text-sm bg-white/10 text-white border border-white/20 hover:bg-white/15 cursor-pointer focus:outline-none"
          >
            <option value="" className="text-gray-900">Tous les sites</option>
            {SITES.map((s) => (
              <option key={s} value={s} className="text-gray-900">{s}</option>
            ))}
          </select>
          <button onClick={quitter} className="px-3 py-1.5 rounded-md text-sm text-blue-100 hover:bg-white/10 hover:text-white whitespace-nowrap">
            Quitter
          </button>
        </div>
      </div>

      {/* Sous-barre du groupe ouvert */}
      {groupeOuvert && (
        <div className="bg-mystory border-t border-white/15">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-2 flex items-center gap-1 overflow-x-auto">
            {groupeOuvert.items.map((i) => {
              const actif = estActif(i.href);
              return (
                <Link key={i.href} href={i.href} onClick={() => setOuvert(null)}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${actif ? "bg-white text-mystory font-medium" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
                  {i.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
