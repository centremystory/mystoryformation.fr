// lib/onglets.ts — Groupes d'onglets partagés (fusion de pages liées en hubs).
import type { Onglet } from "@/components/Onglets";

export const ONGLETS_CATALOGUE: Onglet[] = [
  { href: "/catalogue", label: "Tarifs & formations" },
  { href: "/catalogue/offres", label: "Offres & formules (v6)" },
];

export const ONGLETS_SATISFACTION: Onglet[] = [
  { href: "/satisfaction-cours", label: "Saisie (à chaud)" },
  { href: "/bilan-satisfaction", label: "Bilan & NPS" },
];

export const ONGLETS_RH: Onglet[] = [
  { href: "/equipe", label: "Équipe" },
  { href: "/formateurs", label: "Formateurs" },
  { href: "/planning-employes", label: "Planning équipe" },
  { href: "/pointage", label: "Pointage" },
  { href: "/conges", label: "Congés" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/rapport-hebdo", label: "Rapport hebdo" },
];
