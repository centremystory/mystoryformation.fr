/**
 * MYSTORY — Rôles & permissions (item 18).
 * La plupart des actions sont ouvertes à tout staff connecté ; seules quelques
 * actions sensibles sont restreintes par rôle. La session « équipe » historique
 * (role "staff", mot de passe partagé) garde l'accès complet le temps de la bascule.
 */
export const ROLES = ["direction", "pedagogie", "formatrice", "commercial", "secretariat", "communication"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  direction: "Direction",
  pedagogie: "Pédagogie / Qualité",
  formatrice: "Formatrice",
  commercial: "Commercial",
  secretariat: "Secrétariat",
  communication: "Communication",
};

export type ActionSensible =
  | "comptes_gerer"
  | "conventions_envoyer"
  | "bpf_saisir"
  | "facturation"
  | "evaluation_finale";

export const PERMISSIONS: Record<ActionSensible, { label: string; roles: Role[] }> = {
  comptes_gerer: { label: "Gérer les comptes & accès", roles: ["direction"] },
  conventions_envoyer: { label: "Envoyer une convention en signature", roles: ["direction", "secretariat"] },
  bpf_saisir: { label: "BPF : saisir le déposé / exports", roles: ["direction"] },
  facturation: { label: "Facturation", roles: ["direction", "secretariat"] },
  evaluation_finale: { label: "Évaluation finale (niveau atteint)", roles: ["pedagogie", "formatrice", "direction"] },
};

/** Le rôle peut-il réaliser l'action sensible ? La session équipe ("staff") garde l'accès complet. */
export function peut(role: string | undefined | null, action: ActionSensible): boolean {
  if (role === "staff") return true; // session équipe historique (transition)
  if (!role) return false;
  return PERMISSIONS[action].roles.includes(role as Role);
}

/**
 * Permissions PAR PAGE (item 22). Préfixe de chemin → rôles autorisés.
 * Tout chemin NON listé est ouvert à tous les rôles. Le filet de transition
 * (rôle "staff" du mot de passe d'équipe, ou session sans rôle) garde l'accès complet
 * tant que les comptes individuels ne sont pas généralisés.
 */
export const PAGE_PERMISSIONS: Record<string, Role[]> = {
  "/comptes": ["direction"],
  "/bpf": ["direction"],
  "/journal": ["direction"],
  "/incidents": ["direction", "pedagogie"],
  "/factures": ["direction", "secretariat"],
  "/examens/remboursements": ["direction", "secretariat"],
};

/** Le rôle peut-il accéder à cette page ? "staff"/sans-rôle = oui (transition). Non listé = oui. */
export function peutVoirPage(role: string | undefined | null, pathname: string): boolean {
  if (!role || role === "staff") return true; // filet de transition
  // Préfixe le plus spécifique d'abord (ex. /examens/remboursements avant /examens).
  const cles = Object.keys(PAGE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const cle of cles) {
    if (pathname === cle || pathname.startsWith(cle + "/")) {
      return PAGE_PERMISSIONS[cle].includes(role as Role);
    }
  }
  return true; // page non restreinte
}
