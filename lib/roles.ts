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
