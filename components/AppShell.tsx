"use client";
// components/AppShell.tsx — Coquille de l'app MYSTORY (SaaS épuré).
// Sidebar gauche (filtrée par rôle) + topbar sticky (titre + recherche + site) + drawer mobile.
// Remplace l'ancienne NavBar bleue du haut. Masquée sur les pages publiques.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Home, Search, GraduationCap, LayoutGrid, CalendarDays, Star, BookOpen, FolderOpen, ClipboardCheck,
  ClipboardList, Users, Plane, CalendarRange, Clock, Settings, Receipt, CheckCircle2,
  FileSpreadsheet, UserCog, MessageSquare, Eye, HelpCircle, KeyRound, AlertTriangle,
  Workflow, ScrollText, LogOut, Menu, X, ChevronDown,
  Plus, FileCheck, RotateCcw, Trophy, } from "lucide-react";
import { peutVoirPage, ROLE_LABEL } from "@/lib/roles";
import { SITES, COOKIE_SITE, siteValide } from "@/lib/sites";

const PAGES_SANS_NAV = ["/connexion", "/qcm", "/positionnement", "/suivi", "/evaluation", "/fiche-besoin", "/emargement/signer", "/satisfaction", "/formateur-questionnaire", "/contact", "/partenaire"];

type Lien = { href: string; label: string; icon: LucideIcon };
type Entree = { type: "link"; href: string; label: string; icon: LucideIcon } | { type: "menu"; label: string; icon: LucideIcon; items: Lien[] };

const NAV: Entree[] = [
  { type: "link", href: "/", label: "Accueil", icon: Home },
  { type: "link", href: "/recherche", label: "Rechercher", icon: Search },
  {
    type: "menu", label: "Formation", icon: GraduationCap, items: [
      { href: "/formation", label: "Tableau de bord", icon: LayoutGrid },
      { href: "/inscriptions/nouvelle", label: "Inscrire", icon: Plus },
      { href: "/dossiers", label: "Dossiers", icon: FolderOpen },
      { href: "/emargement", label: "Suivi des cours", icon: ClipboardCheck },
      { href: "/contenu-pedagogique", label: "Pédagogie", icon: BookOpen },
      { href: "/satisfaction-cours", label: "Satisfaction", icon: Star },
    ],
  },
  {
    type: "menu", label: "Examen", icon: ClipboardList, items: [
      { href: "/examen", label: "Tableau de bord", icon: LayoutGrid },
      { href: "/examens/vente-groupe", label: "Inscrire", icon: Plus },
      { href: "/examens/candidats", label: "Candidats", icon: Users },
      { href: "/examens", label: "Sessions", icon: CalendarDays },
      { href: "/examens/corrections", label: "Résultats", icon: FileCheck },
      { href: "/examens/remboursements", label: "Remboursements", icon: RotateCcw },
    ],
  },
  {
    type: "menu", label: "RH", icon: Users, items: [
      { href: "/equipe", label: "Équipe", icon: Users },
      { href: "/formateurs", label: "Formateurs", icon: UserCog },
      { href: "/conges", label: "Congés", icon: Plane },
      { href: "/planning-employes", label: "Planning équipe", icon: CalendarRange },
      { href: "/pointage", label: "Pointage", icon: Clock },
    ],
  },
  {
    type: "menu", label: "Finances", icon: Receipt, items: [
      { href: "/factures", label: "Factures", icon: Receipt },
      { href: "/validations", label: "Validations", icon: CheckCircle2 },
      { href: "/bpf", label: "BPF", icon: FileSpreadsheet },
      { href: "/classement", label: "Classement", icon: Trophy },
    ],
  },
  {
    type: "menu", label: "Relation", icon: MessageSquare, items: [
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/faq", label: "FAQ", icon: HelpCircle },
      { href: "/veille", label: "Veille", icon: Eye },
    ],
  },
  {
    type: "menu", label: "Système", icon: Settings, items: [
      { href: "/comptes", label: "Comptes", icon: KeyRound },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
      { href: "/automatisations", label: "Automatisations", icon: Workflow },
      { href: "/journal", label: "Journal", icon: ScrollText },
    ],
  },
];

const TOUS_HREFS: string[] = NAV.flatMap((e) => (e.type === "link" ? [e.href] : e.items.map((i) => i.href)));

/** Sous-pages regroupées sous une entrée de menu (pour le surlignage du menu). */
const ALIAS_EXAMEN: Record<string, string> = {
  "/examens/vente": "/examens/vente-groupe",
  "/examens/preinscriptions": "/examens/vente-groupe",
  "/examens/croise": "/examens/candidats",
  "/examens/jour": "/examens",
  "/examens/liste-attente": "/examens",
  "/examens/taux": "/examens/corrections",
  // Formation
  "/positionnements": "/inscriptions/nouvelle",
  "/edof": "/dossiers",
  "/suivi-eleves": "/emargement",
  "/planning": "/emargement",
  "/calendrier": "/emargement",
  "/programmes": "/contenu-pedagogique",
};

/** href actif = le plus long préfixe du chemin courant. Évite que /examen et /examens
 *  (ou /examens et /examens/jour) soient marqués actifs en même temps. */
function hrefActifDe(pathname: string): string {
  for (const [prefixe, cible] of Object.entries(ALIAS_EXAMEN)) {
    if (pathname === prefixe || pathname.startsWith(prefixe + "/")) return cible;
  }
  let best = "";
  for (const h of TOUS_HREFS) {
    const ok = h === "/" ? pathname === "/" : (pathname === h || pathname.startsWith(h + "/"));
    if (ok && h.length > best.length) best = h;
  }
  return best;
}
const estActif = (pathname: string, href: string) => href === hrefActifDe(pathname);

/** Titre de page dérivé du chemin courant (pour la topbar). */
function titreDe(pathname: string): string {
  for (const e of NAV) {
    if (e.type === "link" && estActif(pathname, e.href)) return e.label;
    if (e.type === "menu") {
      const it = e.items.find((i) => estActif(pathname, i.href));
      if (it) return it.label;
    }
  }
  return "MYSTORY";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [site, setSite] = useState<string>("");
  const [drawer, setDrawer] = useState(false);
  const [ouverts, setOuverts] = useState<string[]>([]);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => { if (vivant) setRole(j?.ok ? (j.user?.role ?? null) : null); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    const m = document.cookie.split("; ").find((c) => c.startsWith(COOKIE_SITE + "="));
    setSite(siteValide(m ? decodeURIComponent(m.split("=").slice(1).join("=")) : ""));
  }, []);

  const navVisible = useMemo(() => NAV
    .map((e) => (e.type === "menu" ? { ...e, items: e.items.filter((i) => peutVoirPage(role, i.href)) } : e))
    .filter((e) => (e.type === "link" ? peutVoirPage(role, e.href) : e.items.length > 0)), [role]);

  // Ouvre automatiquement le groupe contenant la page active.
  useEffect(() => {
    const actifs = navVisible.filter((e) => e.type === "menu" && (e as any).items.some((i: Lien) => estActif(pathname, i.href))).map((e) => e.label);
    if (actifs.length) setOuverts((g) => Array.from(new Set([...g, ...actifs])));
  }, [pathname, navVisible]);

  const estPublic = PAGES_SANS_NAV.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (estPublic) return <>{children}</>;

  function changerSite(v: string) {
    const val = siteValide(v);
    document.cookie = `${COOKIE_SITE}=${encodeURIComponent(val)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setSite(val);
    window.location.reload();
  }
  async function quitter() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    router.push("/connexion");
  }
  function toggleGroupe(label: string) {
    setOuverts((g) => (g.includes(label) ? g.filter((x) => x !== label) : [...g, label]));
  }
  function lancerRecherche(e: React.FormEvent) {
    e.preventDefault();
    const q = recherche.trim();
    if (q.length >= 2) { setDrawer(false); router.push(`/recherche?q=${encodeURIComponent(q)}`); }
  }

  const roleLabel = role && role in ROLE_LABEL ? ROLE_LABEL[role as keyof typeof ROLE_LABEL] : "Équipe";

  // --- Contenu de la navigation (réutilisé desktop + drawer) ---
  const nav = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      {navVisible.map((e) => {
        if (e.type === "link") {
          const actif = estActif(pathname, e.href);
          const Icone = e.icon;
          return (
            <Link key={e.href} href={e.href} onClick={onNavigate}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${actif ? "bg-mystory-clair font-medium text-mystory-fonce" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
              {actif && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-mystory" />}
              <Icone size={18} strokeWidth={1.75} className="shrink-0" />
              <span>{e.label}</span>
            </Link>
          );
        }
        const ouvert = ouverts.includes(e.label);
        const grpActif = e.items.some((i) => estActif(pathname, i.href));
        const Icone = e.icon;
        return (
          <div key={e.label}>
            <button onClick={() => toggleGroupe(e.label)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${grpActif ? "text-mystory-fonce" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icone size={18} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 text-left font-medium">{e.label}</span>
              <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${ouvert ? "rotate-180" : ""}`} />
            </button>
            {ouvert && (
              <div className="mt-0.5 space-y-0.5 pl-3">
                {e.items.map((i) => {
                  const actif = estActif(pathname, i.href);
                  const SousIcone = i.icon;
                  return (
                    <Link key={i.href} href={i.href} onClick={onNavigate}
                      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${actif ? "bg-mystory-clair font-medium text-mystory-fonce" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
                      {actif && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-mystory" />}
                      <SousIcone size={16} strokeWidth={1.75} className="shrink-0" />
                      <span>{i.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const pied = (
    <div className="border-t border-gray-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mystory-clair text-sm font-semibold text-mystory-fonce">M</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-800">MYSTORY</p>
          <p className="truncate text-xs text-gray-500">{roleLabel}</p>
        </div>
        <button onClick={quitter} aria-label="Se déconnecter" title="Se déconnecter"
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-danger-600">
          <LogOut size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-200 bg-white lg:flex">
        <Link href="/" className="flex items-center gap-2 px-4 h-16 shrink-0 border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/embleme-blanc.png" alt="" className="h-8 w-auto rounded bg-mystory p-1" />
          <span className="font-semibold tracking-tight text-gray-900">MYSTORY</span>
        </Link>
        {nav()}
        {pied}
      </aside>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-pop">
            <div className="flex items-center justify-between px-4 h-16 shrink-0 border-b border-gray-100">
              <span className="font-semibold tracking-tight text-gray-900">MYSTORY</span>
              <button onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>
            {nav(() => setDrawer(false))}
            {pied}
          </aside>
        </div>
      )}

      {/* Colonne principale */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => setDrawer(true)} aria-label="Ouvrir le menu" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden">
            <Menu size={20} />
          </button>
          <h1 className="text-base font-semibold tracking-tight text-gray-900">{titreDe(pathname)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <form onSubmit={lancerRecherche} className="hidden sm:block">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher…"
                  className="w-40 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 transition focus:w-56 focus:border-mystory focus:bg-white focus-visible:ring-2 focus-visible:ring-mystory/30 md:w-48" />
              </div>
            </form>
            <select value={site} onChange={(e) => changerSite(e.target.value)} aria-label="Filtrer par site"
              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-mystory/30">
              <option value="">Tous les sites</option>
              {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
