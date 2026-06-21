/**
 * MYSTORY — Rôles & permissions (contrôle d'accès v2).
 * Jeu DÉFINITIF de 5 rôles staff. La vraie barrière est CÔTÉ SERVEUR
 * (requireRole sur les routes + middleware sur les pages + filtrage NavBar/compteurs) :
 * le CRM interroge Supabase via service_role, donc la RLS ne restreint pas l'app.
 *
 * Filet de transition : tant que le mot de passe d'équipe (rôle "staff") est actif,
 * une session sans rôle individuel garde l'accès complet — le gating « dur » par rôle
 * ne mord que sur les comptes individuels. ('partenaire' = portail à jeton, hors matrice staff.)
 */
export const ROLES = ["direction", "manager", "commercial", "formatrice", "back_office"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  direction: "Direction",
  manager: "Manager de site",
  commercial: "Commercial",
  formatrice: "Formatrice",
  back_office: "Back-office",
};

export type ActionSensible =
  | "comptes_gerer"
  | "conventions_envoyer"
  | "bpf_saisir"
  | "facturation"
  | "evaluation_finale";

export const PERMISSIONS: Record<ActionSensible, { label: string; roles: Role[] }> = {
  comptes_gerer: { label: "Gérer les comptes & accès", roles: ["direction"] },
  conventions_envoyer: { label: "Envoyer une convention en signature", roles: ["direction", "manager", "back_office"] },
  bpf_saisir: { label: "BPF : saisir le déposé / exports", roles: ["direction"] },
  facturation: { label: "Facturation", roles: ["direction", "manager", "back_office"] },
  evaluation_finale: { label: "Évaluation finale (niveau atteint)", roles: ["direction", "manager", "formatrice"] },
};

/**
 * Agit-il avec l'autorité de la Direction ? Direction + le filet de transition
 * (session équipe "staff", ou token de service sans rôle = n8n/cron) passent.
 * Sert à la « Validation Direction » (point 26).
 */
/** Normalise un rôle unique OU une liste de rôles en tableau (multi-rôles / polyvalence). */
export function asRoles(role: string | string[] | undefined | null): string[] {
  if (!role) return [];
  return (Array.isArray(role) ? role : [role]).filter(Boolean) as string[];
}

export function estDirection(role: string | string[] | undefined | null): boolean {
  const rs = asRoles(role);
  return rs.length === 0 || rs.includes("staff") || rs.includes("direction");
}

/** Le rôle peut-il réaliser l'action sensible ? La session équipe ("staff") garde l'accès complet. */
export function peut(role: string | string[] | undefined | null, action: ActionSensible): boolean {
  const rs = asRoles(role);
  if (rs.includes("staff")) return true; // session équipe historique (transition)
  if (rs.length === 0) return false;
  // Multi-rôles : autorisé si AU MOINS UN rôle porte l'action (union des droits).
  return rs.some((r) => PERMISSIONS[action].roles.includes(r as Role));
}

/**
 * Automate de confiance (n8n / cron) : JWT valide signé par AUTH_SECRET dont le rôle
 * n'appartient PAS à la matrice staff (5 rôles + "staff"). Sûr par construction —
 * un compte humain porte TOUJOURS un rôle de la matrice, donc on ne peut pas usurper
 * l'exemption en rejouant un cookie de session humain en en-tête Bearer.
 */
const ROLES_MATRICE = new Set<string>([...ROLES, "staff"]);
export function estAutomate(role: string | string[] | undefined | null): boolean {
  const rs = asRoles(role);
  return rs.length > 0 && rs.every((r) => !ROLES_MATRICE.has(r));
}

/**
 * Garde d'action « tolérante aux automates », pour les routes appelées par n8n/cron.
 * Passe si : sans rôle (filet équipe partagée) · "staff" · automate de confiance · rôle autorisé.
 * Ne bloque qu'un humain identifié dont le rôle n'a pas l'action.
 */
export function peutAgir(role: string | string[] | undefined | null, action: ActionSensible): boolean {
  const rs = asRoles(role);
  if (rs.length === 0 || rs.includes("staff")) return true;
  if (estAutomate(rs)) return true;
  return peut(rs, action);
}

/**
 * Permissions PAR PAGE. Préfixe de chemin → rôles autorisés.
 * Tout chemin NON listé est ouvert à tous les rôles staff. Le filet de transition
 * (rôle "staff" / session sans rôle) garde l'accès complet tant que les comptes
 * individuels ne sont pas généralisés.
 *
 * Direction SEULE : finances globales & administration (jamais l'équipe).
 * Le scoping fin (commercial = SES stats, manager = SON site) arrive avec la brique multi-sites.
 */
export const PAGE_PERMISSIONS: Record<string, Role[]> = {
  // — Direction seule —
  "/comptes": ["direction"],
  "/journal": ["direction"],
  "/bpf": ["direction"],
  "/classement": ["direction"],          // CA & primes globaux (vue par site -> multi-sites)
  "/incidents": ["direction"],
  // — Finance unitaire / contractualisation —
  "/factures": ["direction", "manager", "back_office"],
  "/examens/remboursements": ["direction", "manager", "back_office"],
  "/examens/croise": ["direction", "manager"],
  // — Commercial / prospects —
  "/inscriptions": ["direction", "manager", "commercial", "back_office"],
  "/messages": ["direction", "manager", "commercial"],
  // — Dossiers / conformité / EDOF (back-office) —
  "/dossiers/conformite": ["direction", "manager", "back_office"],
  "/dossiers/edof": ["direction", "manager", "back_office"],
  "/edof": ["direction", "manager", "back_office"],
  "/dossiers": ["direction", "manager", "back_office", "formatrice"],
  // — Pédagogie / suivi élèves (formatrice) —
  "/formation": ["direction", "manager", "formatrice"],
  "/programmes": ["direction", "manager", "formatrice"],
  "/contenu-pedagogique": ["direction", "manager", "formatrice"],
  "/suivi-eleves": ["direction", "manager", "formatrice"],
  "/tests/a-noter": ["direction", "manager", "formatrice", "back_office"],
  "/tests/banque": ["direction", "manager", "formatrice"],
  "/satisfaction-cours": ["direction", "manager", "formatrice"],
  "/emargement": ["direction", "manager", "formatrice", "back_office"],
  // — RH équipe (encadrement) —
  "/formateurs": ["direction", "manager"],
  "/planning-employes": ["direction", "manager"],
  "/pointage": ["direction", "manager"],
  "/equipe": ["direction", "manager"],
  // — Supervision automatisations (lecture seule n8n) —
  "/automatisations": ["direction", "manager"],
};

/** Le rôle peut-il accéder à cette page ? "staff"/sans-rôle = oui (transition). Non listé = oui. */
export function peutVoirPage(role: string | string[] | undefined | null, pathname: string): boolean {
  const rs = asRoles(role);
  if (rs.length === 0 || rs.includes("staff")) return true; // filet de transition
  // Préfixe le plus spécifique d'abord (ex. /dossiers/conformite avant /dossiers).
  const cles = Object.keys(PAGE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const cle of cles) {
    if (pathname === cle || pathname.startsWith(cle + "/")) {
      // Multi-rôles : accès si AU MOINS UN rôle est autorisé sur la page.
      return rs.some((r) => PAGE_PERMISSIONS[cle].includes(r as Role));
    }
  }
  return true; // page non restreinte
}

/** Rôles autorisés pour une page (pour requireRole côté API). [] si non restreinte. */
export function rolesAutorisesPage(pathname: string): Role[] {
  const cles = Object.keys(PAGE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const cle of cles) {
    if (pathname === cle || pathname.startsWith(cle + "/")) return PAGE_PERMISSIONS[cle];
  }
  return [];
}
