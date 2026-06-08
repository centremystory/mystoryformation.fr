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

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const AUTH_COOKIE = process.env.AUTH_COOKIE ?? "mystory_session";

export interface SessionUser {
  id: string;
  email?: string;
  role?: string;
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

/** Vérifie la session. Renvoie l'utilisateur ou null. Fail-closed si AUTH_SECRET absent. */
export async function verifySession(req: Request): Promise<SessionUser | null> {
  if (!AUTH_SECRET) return null; // pas de secret = on refuse (jamais d'accès par défaut)
  const token = extractToken(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(AUTH_SECRET));
    const id = (payload.sub ?? payload.id) as string | undefined;
    if (!id) return null;
    return { id, email: payload.email as string | undefined, role: payload.role as string | undefined };
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
