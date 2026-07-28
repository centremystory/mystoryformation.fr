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
  // — Assistant IA (données live, lecture seule) —
  "/assistant": ["direction", "manager"],
  // — Direction seule —
  "/comptes": ["direction"],
  "/permissions": ["direction"],
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
  "/ventes-formation": ["direction", "manager", "commercial", "back_office"],
  "/cockpit-commercial": ["direction", "manager", "commercial", "back_office"],
  "/messages": ["direction", "manager", "commercial"],
  // — Outils suivi candidat / qualité (commercial + encadrement, pas formatrice) —
  "/attestations-paiement": ["direction", "manager", "commercial", "back_office"],
  "/reclamations": ["direction", "manager", "commercial", "back_office", "formatrice"],
  "/anomalies": ["direction", "manager", "commercial", "back_office"],
  // — Dossiers / conformité / EDOF (back-office) —
  "/dossiers/conformite": ["direction", "manager", "back_office"],
  "/dossiers/edof": ["direction", "manager", "back_office"],
  "/edof": ["direction", "manager", "back_office"],
  "/direction": ["direction", "manager"],
  "/catalogue": ["direction", "manager"],
  "/reglages": ["direction", "manager"],
  "/centres": ["direction", "manager"],
  "/dossiers": ["direction", "manager", "back_office", "formatrice"],
  // — Pédagogie / suivi élèves (formatrice) —
  "/formation": ["direction", "manager", "formatrice"],
  "/programmes": ["direction", "manager", "formatrice"],
  "/contenu-pedagogique": ["direction", "manager", "formatrice"],
  "/suivi-eleves": ["direction", "manager", "formatrice"],
  "/tests/tous": ["direction", "manager", "formatrice", "back_office"],
  "/tests/a-noter": ["direction", "manager", "formatrice", "back_office"],
  "/tests/banque": ["direction", "manager", "formatrice"],
  "/satisfaction-cours": ["direction", "manager", "formatrice"],
  "/emargement": ["direction", "manager", "formatrice", "back_office"],
  // — RH équipe (encadrement) —
  "/formateurs": ["direction", "manager"],
  "/confidentialite": ["direction", "manager"],
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

/* ────────────────────────────────────────────────────────────────────────
 * VERROU « PROPRIÉTAIRE » — finance & BPF réservés au SEUL Arudhan (par email).
 * Plus strict que le rôle "direction" (lavania@ a aussi direction) et IGNORE le
 * filet "staff" : ces pages/API n'apparaissent et ne répondent QUE pour cet email.
 * Les automates de confiance (n8n/cron, token de service) restent autorisés côté API
 * pour alimenter le brief cash — géré dans requireProprietaire (lib/auth).
 * ──────────────────────────────────────────────────────────────────────── */
export const EMAIL_PROPRIETAIRE = "arudhan@mystoryformation.fr";

/** Préfixes de pages FINANCE réservées au propriétaire (email), sans exception de rôle. */
export const PAGES_PROPRIETAIRE = ["/bpf", "/direction", "/classement", "/finances", "/activite"] as const;

export function estProprietaire(email: string | undefined | null): boolean {
  return (email ?? "").trim().toLowerCase() === EMAIL_PROPRIETAIRE;
}

export function pageEstProprietaire(pathname: string): boolean {
  return PAGES_PROPRIETAIRE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Accès à une page en tenant compte À LA FOIS des rôles ET du verrou propriétaire.
 * À utiliser dans le middleware et la nav (remplace peutVoirPage seul).
 */
export function accesPage(
  role: string | string[] | undefined | null,
  email: string | undefined | null,
  pathname: string,
): boolean {
  const p = pathname.split("?")[0]; // ignore la query (ex. /reclamations?type=examen → /reclamations)
  if (pageEstProprietaire(p)) return estProprietaire(email); // finance = email exact, aucun filet
  return peutVoirPage(role, p);
}

/* ────────────────────────────────────────────────────────────────────────
 * PERMISSIONS SELF-SERVICE (overrides DB, tighten-only vs PAGE_PERMISSIONS).
 * Édité dans /permissions ; propagé au middleware Edge via /api/permissions/public.
 * Garde-fous : (1) finance/BPF hors matrice (verrou propriétaire) ; (2) /comptes hors
 * matrice ; (3) la Direction n'est JAMAIS retirable d'une page (anti-lockout).
 * ──────────────────────────────────────────────────────────────────────── */

/** Pages dont les accès sont ajustables en self-service (hors finance + /comptes). */
export const PAGES_EDITABLES: string[] = Object.keys(PAGE_PERMISSIONS)
  .filter((k) => !pageEstProprietaire(k) && k !== "/comptes");

/** Libellés lisibles pour l'éditeur de permissions. */
export const PAGE_LABELS: Record<string, string> = {
  "/assistant": "Assistant IA", "/journal": "Journal", "/incidents": "Incidents",
  "/factures": "Factures", "/examens/remboursements": "Reports · remb. · annul.", "/examens/croise": "Examens (croisé)",
  "/inscriptions": "Inscrire un stagiaire", "/ventes-formation": "Ventes formation", "/cockpit-commercial": "Cockpit commercial",
  "/messages": "Messages (prospects)", "/attestations-paiement": "Attestations de paiement", "/reclamations": "Réclamations",
  "/anomalies": "Anomalies", "/dossiers/conformite": "Dossiers · conformité", "/dossiers/edof": "Dossiers · EDOF",
  "/edof": "EDOF (import)", "/direction": "Direction (cockpit)", "/catalogue": "Catalogue & tarifs", "/reglages": "Réglages",
  "/centres": "Centres", "/dossiers": "Dossiers", "/formation": "Tableau de bord Formation", "/programmes": "Programmes",
  "/contenu-pedagogique": "Pédagogie", "/suivi-eleves": "Suivi élèves", "/tests/tous": "Tous les tests",
  "/tests/a-noter": "Tests à noter", "/tests/banque": "Banque de tests", "/satisfaction-cours": "Satisfaction (cours)",
  "/emargement": "Suivi des cours (émargement)", "/formateurs": "Formateurs", "/confidentialite": "Confidentialité",
  "/planning-employes": "Planning équipe", "/pointage": "Pointage", "/equipe": "Équipe", "/automatisations": "Automatisations",
};

/** Fusionne les défauts (code) avec les overrides (DB). Tighten-only + Direction inamovible. */
export function effectivePageRoles(overrides: Record<string, string[]>): Record<string, Role[]> {
  const out: Record<string, Role[]> = {};
  for (const [cle, def] of Object.entries(PAGE_PERMISSIONS)) {
    const ov = overrides[cle];
    if (!ov || pageEstProprietaire(cle) || cle === "/comptes") { out[cle] = def; continue; }
    const restreint = def.filter((r) => ov.includes(r)); // ⊆ défaut (tighten-only)
    if (def.includes("direction") && !restreint.includes("direction")) restreint.unshift("direction"); // anti-lockout
    out[cle] = restreint as Role[];
  }
  return out;
}

/** Comme peutVoirPage, mais avec une map effective déjà résolue (middleware Edge / nav). */
export function peutVoirPageAvec(role: string | string[] | undefined | null, pathname: string, map: Record<string, string[]>): boolean {
  const rs = asRoles(role);
  if (rs.length === 0 || rs.includes("staff")) return true;
  const cles = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const cle of cles) {
    if (pathname === cle || pathname.startsWith(cle + "/")) return rs.some((r) => map[cle].includes(r));
  }
  return true;
}

/** accesPage avec map effective (rôles + verrou propriétaire). Utilisé middleware + nav. */
export function accesPageAvec(
  role: string | string[] | undefined | null,
  email: string | undefined | null,
  pathname: string,
  map: Record<string, string[]>,
): boolean {
  const p = pathname.split("?")[0];
  if (pageEstProprietaire(p)) return estProprietaire(email);
  return peutVoirPageAvec(role, p, map);
}
