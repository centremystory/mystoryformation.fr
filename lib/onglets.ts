// lib/onglets.ts — Groupes d'onglets partagés (fusion de pages liées en hubs).
import type { Onglet } from "@/components/Onglets";


export const ONGLETS_SATISFACTION: Onglet[] = [
  { href: "/satisfaction-cours", label: "Saisie (à chaud)" },
  { href: "/bilan-satisfaction", label: "Bilan & NPS" },
];

export const ONGLETS_TESTS: Onglet[] = [
  { href: "/tests/tous", label: "Tous les tests" },
  { href: "/tests/a-noter", label: "À noter" },
  { href: "/tests/relances", label: "Relances à distance" },
  { href: "/tests/banque", label: "Banque de tests" },
];

export const ONGLETS_REGLAGES: Onglet[] = [
  { href: "/reglages", label: "Réglages" },
  { href: "/centres", label: "Centres" },
  { href: "/catalogue", label: "Catalogue & tarifs" },
  { href: "/catalogue/offres", label: "Offres & formules" },
];

// Communication — messagerie d'équipe + prospects regroupée en un hub.
export const ONGLETS_MESSAGERIE: Onglet[] = [
  { href: "/equipe-messages", label: "Fil d'équipe" },
  { href: "/interne", label: "Questions internes" },
  { href: "/messages", label: "Messages prospects" },
];

// Commercial — cockpit + liste des ventes formation.
export const ONGLETS_COMMERCIAL: Onglet[] = [
  { href: "/cockpit-commercial", label: "Cockpit" },
  { href: "/ventes-formation", label: "Ventes formation" },
  { href: "/examens/candidats", label: "Ventes examens" },
];

// Système — comptes & accès par rôle.
export const ONGLETS_COMPTES: Onglet[] = [
  { href: "/comptes", label: "Comptes" },
  { href: "/permissions", label: "Accès par rôle" },
];

// Système — journal & incidents techniques.
export const ONGLETS_JOURNAL: Onglet[] = [
  { href: "/journal", label: "Journal" },
  { href: "/incidents", label: "Incidents" },
];

export const ONGLETS_RH: Onglet[] = [
  { href: "/equipe", label: "Équipe" },
  { href: "/formateurs", label: "Formateurs" },
  { href: "/planning-employes", label: "Planning équipe" },
  { href: "/pointage", label: "Pointage" },
  { href: "/conges", label: "Congés" },
  { href: "/confidentialite", label: "Confidentialité" },
];
