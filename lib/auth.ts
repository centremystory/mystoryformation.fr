/**
 * MYSTORY — Authentification  (Brique 2D, sécurité)
 * -------------------------------------------------
 * `verifySession` : vérifie la session (cookie ou Bearer), compatible Edge (jose) → utilisable
 *                   dans middleware.ts.
 * `requireUser`   : à appeler EN TÊTE de tout handler de route sensible ; renvoie l'utilisateur
 *                   ou lève UnauthorizedError (→ 401). Défense en profondeur, en plus du middleware.
 *
 * Adapter `verifySession` à ton auth réel (NextAuth `getToken`, Clerk, session maison…).
 * Tel quel : JWT signé avec AUTH_SECRET, lu dans le cookie `mystory_session` ou l'en-tête Bearer.
 *
 * Env : AUTH_SECRET (clé de signature du JWT de session), AUTH_COOKIE (défaut: mystory_session).
 */

import { jwtVerify } from "jose";
import { estProprietaire, estAutomate, audienceHorsEquipe } from "./roles";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const AUTH_COOKIE = process.env.AUTH_COOKIE ?? "mystory_session";

export interface SessionUser {
  id: string;
  email?: string;
  nom?: string;        // nom affiché (présent sur les comptes individuels ; absent pour le filet équipe)
  role?: string;       // rôle principal (= roles[0]) — conservé pour rétro-compat
  roles?: string[];    // multi-rôles (polyvalence) — union des droits
}

export class UnauthorizedError extends Error {
  constructor(message = "Non authentifié") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Extrait le jeton de la requête : cookie de session en priorité, sinon Authorization: Bearer. */
function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  const cookie = req.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === AUTH_COOKIE) return decodeURIComponent(v.join("="));
    }
  }
  return null;
}

/**
 * Vérifie la session. Renvoie l'utilisateur ou null. Fail-closed si AUTH_SECRET absent.
 *
 * ⚠️ UNE SIGNATURE VALIDE NE DIT PAS À QUEL PUBLIC LE JETON ÉTAIT DESTINÉ.
 * Tous les jetons du CRM sont signés avec le MÊME AUTH_SECRET. Avant le
 * 09/10/2026, cette fonction se contentait de vérifier la signature : un jeton
 * du portail PARTENAIRE, présenté dans un en-tête `Authorization: Bearer`,
 * ressortait donc ici comme une session d'équipe valide (simplement sans rôle).
 * Et comme « sans rôle » valait filet de transition partout, un partenaire
 * atteignait le back-office, les incidents, le classement, les factures et
 * toutes les routes gardées par `requireUser` — dont l'identité complète des
 * candidats. Le middleware global, qui appelle cette fonction, ne voyait rien.
 *
 * ÉMETTEURS DE JETONS SIGNÉS AVEC AUTH_SECRET — inventaire du 09/10/2026
 * (relevé dans le code, pour que le prochain lecteur n'ait pas à le refaire) :
 *   1. app/api/auth/login — connexion individuelle : AUCUNE audience, rôle(s) de
 *      la matrice staff (les 7 comptes actifs portent tous au moins un rôle) ;
 *   2. app/api/auth/login — filet « mot de passe d'équipe » : AUCUNE audience,
 *      rôle "staff", sub "equipe-mystory", pas de `nom` ;
 *   3. app/api/cron/tick — jeton de service éphémère (5 min) du cron Vercel :
 *      AUCUNE audience, AUCUN rôle. Il POSTe sur ses 10 routes de relance, qui
 *      sont gardées par `requireUser` (+ `peutAgir`), jamais par `requireRole` ;
 *   4. lib/prescripteurAuth — portail des organismes prescripteurs : audience
 *      "prescripteur", aucun rôle. SEUL public étranger à l'équipe à ce jour ;
 *   5. n8n, credential « MYSTORY Service JWT (Bearer) » (hPCAPKxg9pkXdUbW) :
 *      jeton fabriqué HORS du dépôt, donc non lisible (l'API n8n ne rend jamais
 *      le secret d'un credential). MESURÉ le 09/10/2026 en interrogeant la prod
 *      avec ce credential : /api/classement 200, /api/incidents 200, mais
 *      /api/factures/pdf 403. Il PORTE donc un ou des rôles, tous HORS matrice
 *      staff — il passe par `estAutomate`, jamais par le filet « sans rôle ».
 *      Son audience, elle, reste inconnue.
 *
 * D'où la forme du verrou : on refuse les audiences DÉCLARÉES étrangères
 * (`AUDIENCES_HORS_EQUIPE` dans lib/roles) plutôt que d'exiger une audience
 * d'équipe. Exiger `aud: "equipe"` serait plus strict, mais aucun des émetteurs
 * 1-3 n'en pose et l'audience du jeton n8n (5) n'est pas mesurable : on
 * couperait d'un coup tous les robots. Ce resserrage-là suppose de refaire le
 * credential n8n, puis les émetteurs 1-3, dans cet ordre — pas en vendredi
 * après-midi. La liste noire, elle, est sûre quel que soit le jeton n8n.
 */
export async function verifySession(req: Request): Promise<SessionUser | null> {
  if (!AUTH_SECRET) return null; // pas de secret = on refuse (jamais d'accès par défaut)
  const token = extractToken(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(AUTH_SECRET));
    // Jeton destiné à un AUTRE public (portail partenaire…) : il ne produit JAMAIS
    // une session d'équipe, même présenté en Bearer et même parfaitement signé.
    if (audienceHorsEquipe(payload.aud)) return null;
    const id = (payload.sub ?? payload.id) as string | undefined;
    if (!id) return null;
    const rolesArr = Array.isArray(payload.roles)
      ? (payload.roles as string[]).filter(Boolean)
      : (payload.role ? [payload.role as string] : []);
    const nom = typeof payload.nom === "string" ? payload.nom.trim() || undefined : undefined;
    return { id, email: payload.email as string | undefined, nom, role: rolesArr[0] ?? (payload.role as string | undefined), roles: rolesArr };
  } catch {
    return null; // signature/exp invalide
  }
}

/** À appeler en tête de handler. Lève UnauthorizedError si non authentifié. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await verifySession(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

export class ForbiddenError extends Error {
  constructor(message = "Accès refusé") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Garde par rôle, à appeler en tête d'une route sensible (défense en profondeur, en plus
 * du middleware de page). Lève UnauthorizedError (→401) si non connecté, ForbiddenError (→403)
 * si le rôle individuel n'est pas autorisé. Filet de transition : la session équipe ("staff")
 * passe toujours, ainsi que les automates de confiance.
 *
 * 09/10/2026 — le filet « AUCUN rôle = tous les droits » (`rs.length === 0`) est RETIRÉ.
 * Il n'était plus porté par personne, et il faisait de n'importe quel jeton sans rôle un
 * passe-partout : c'est par lui qu'un jeton du portail partenaire atteignait /api/incidents
 * et /api/classement. Mesuré avant de le retirer :
 *   — les 7 comptes humains actifs portent TOUS au moins un rôle (table `utilisateurs`) ;
 *     le « filet équipe » est le rôle "staff", pas une absence de rôle ;
 *   — le jeton de service n8n porte des rôles hors matrice → il passe par `estAutomate` ;
 *   — le jeton éphémère du cron Vercel (app/api/cron/tick) est, lui, SANS rôle, mais ses
 *     10 cibles sont gardées par `requireUser` / `peutAgir`, aucune par `requireRole`.
 * Conséquence à connaître : si l'on garde un jour une cible du cron par `requireRole`, il
 * faudra d'abord donner un rôle hors matrice au jeton du tick (il deviendra un automate).
 *
 * 25/09/2026 — ajout de l'exemption AUTOMATE, qui manquait ici alors que `requireProprietaire`
 * l'applique depuis le début. Un jeton de service n8n porte un rôle HORS matrice staff : il ne
 * tombait donc ni dans `rs.length === 0`, ni dans "staff", ni dans la liste autorisée, et toutes
 * les routes gardées par rôle lui répondaient 403. Constaté sur `/api/classement` (le classement
 * vendeurs du back-office n'était plus alimenté) ET sur `/api/incidents` (aucun échec de robot
 * n'était consigné). `estAutomate` exige un JWT valide signé par AUTH_SECRET dont AUCUN rôle
 * n'appartient à la matrice : un humain porte toujours un rôle de la matrice, l'exemption ne
 * peut donc pas être usurpée en rejouant un cookie de session en en-tête Bearer.
 */
export async function requireRole(req: Request, roles: readonly string[]): Promise<SessionUser> {
  const user = await requireUser(req);
  const rs = user.roles && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : []);
  if (rs.includes("staff") || estAutomate(rs)) return user; // filet équipe + automates de confiance
  // Multi-rôles : autorisé si AU MOINS UN rôle est dans la liste permise.
  if (!rs.some((r) => roles.includes(r))) throw new ForbiddenError();
  return user;
}

/**
 * Garde FINANCE : réservée au SEUL propriétaire (arudhan@mystoryformation.fr, par email).
 * AUCUN filet "staff" ni rôle direction — même lavania@ (direction) est refusée.
 * Exception : les automates de confiance (n8n/cron, token de service SANS rôle de la
 * matrice staff) passent, pour alimenter le brief cash — ils ne sont pas des humains.
 * À placer en tête des routes BPF / cockpit direction / classement / finances.
 */
export async function requireProprietaire(req: Request): Promise<SessionUser> {
  const user = await requireUser(req);
  const rs = user.roles && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : []);
  if (estProprietaire(user.email) || estAutomate(rs)) return user;
  throw new ForbiddenError();
}
