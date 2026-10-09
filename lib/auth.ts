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
import { estProprietaire, estAutomate, audienceHorsEquipe, ROLES_MATRICE } from "./roles";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const AUTH_COOKIE = process.env.AUTH_COOKIE ?? "mystory_session";

/* ──────────────────────────────────────────────────────────────────────────────
 * « IL GARDE L'ACCÈS TANT QU'IL EST LÀ » — relecture du compte à chaque requête.
 *
 * LE DÉFAUT, MESURÉ LE 09/10/2026 EN PRODUCTION. Le jeton de session vit 30 jours
 * (app/api/auth/login) et `verifySession` ne vérifiait QUE sa signature. Un compte
 * supprimé de `utilisateurs`, ou passé `actif = false`, continuait donc à répondre
 * 200 jusqu'à l'expiration naturelle du jeton. Mesure : compte de sonde créé,
 * connecté, puis DÉSACTIVÉ puis SUPPRIMÉ — son cookie rendait toujours 200 sur
 * /dossiers. Un départ d'équipe ne fermait rien avant un mois.
 *
 * LE MODÈLE EST CELUI DU PORTAIL PARTENAIRE (lib/prescripteurAuth) : il relit
 * `partenaires.actif` à chaque requête et refuse tout de suite. On applique ici le
 * même principe à l'équipe.
 *
 * ── CE QUI EST RELU, ET CE QUI NE PEUT PAS L'ÊTRE ────────────────────────────
 * On ne relit QUE les comptes individuels, reconnus à DEUX conditions cumulées :
 *   (a) `sub` est un UUID (identifiant de ligne `utilisateurs`), et
 *   (b) le jeton porte au moins un rôle de la MATRICE staff.
 * Ce double filtre est volontaire — il garantit qu'aucun automate ne tombe dedans :
 *   — le filet « mot de passe d'équipe » a `sub = "equipe-mystory"` : pas un UUID,
 *     et AUCUNE ligne en base à relire. Il ne se révoque qu'en changeant
 *     ACCESS_PASSWORD. ⚠️ C'est la limite connue de ce verrou : ce mot de passe là
 *     reste un passe-partout de 30 jours ;
 *   — le jeton du cron Vercel (`sub = "cron-tick"`) ne porte aucun rôle ;
 *   — le jeton de service n8n porte des rôles HORS matrice (c'est ce qui le fait
 *     passer par `estAutomate`) : la condition (b) l'exclut quel que soit son `sub`,
 *     qui n'est pas lisible depuis le dépôt. Sans ce garde-fou, un `sub` en forme
 *     d'UUID aurait fait tomber TOUS les robots d'un coup.
 *
 * ── CE QUE LA RELECTURE CORRIGE EN PLUS ──────────────────────────────────────
 * Les rôles et l'adresse sont repris de la LIGNE, pas du jeton. Un compte rétrogradé
 * perdait sinon ses droits seulement au bout de 30 jours, lui aussi.
 *
 * ── EN PANNE, ON N'ENFERME PERSONNE DEHORS ───────────────────────────────────
 * Supabase injoignable, variable d'environnement absente du runtime Edge, délai
 * dépassé : on LAISSE PASSER le jeton (déjà valablement signé). Refuser ferait
 * d'une panne Supabase une panne totale du CRM, alors que la faille qu'on ferme
 * est « un ancien garde l'accès », pas « un attaquant force la porte ». Une
 * réponse FERME de la base (ligne absente, ou `actif = false`) refuse, elle,
 * immédiatement.
 *
 * ── LE COÛT, ET LE CACHE ─────────────────────────────────────────────────────
 * Une lecture PostgREST par requête, middleware Edge compris. Cache mémoire par
 * instance, TTL ci-dessous : un compte supprimé survit donc au PIRE la durée de ce
 * TTL, pas 30 jours. `fetch` nu plutôt que supabaseAdmin : ce module est importé
 * par middleware.ts (runtime Edge), où l'on ne veut pas tirer tout @supabase/supabase-js.
 * ────────────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
/** Durée de vie du cache de comptes. C'est AUSSI la survie maximale d'un compte supprimé. */
export const TTL_COMPTE_MS = 10_000;
const DELAI_LECTURE_MS = 2500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LigneCompte { actif: boolean; email: string | null; role: string | null; roles: string[] | null }
/** `undefined` = indéterminé (on laisse passer) · `null` = ligne absente (on refuse). */
type Verdict = LigneCompte | null | undefined;

const _comptes = new Map<string, { at: number; v: Verdict }>();

async function lireCompte(id: string): Promise<Verdict> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return undefined; // env absente du runtime → on laisse passer
  const now = Date.now();
  const cache = _comptes.get(id);
  if (cache && now - cache.at < TTL_COMPTE_MS) return cache.v;

  let v: Verdict;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), DELAI_LECTURE_MS);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/utilisateurs?id=eq.${encodeURIComponent(id)}&select=actif,email,role,roles&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" },
        cache: "no-store",
        signal: ctl.signal,
      },
    );
    clearTimeout(t);
    if (!r.ok) return undefined;                       // 5xx / quota → indéterminé, on laisse passer
    const lignes = (await r.json()) as LigneCompte[];
    v = Array.isArray(lignes) && lignes.length > 0 ? lignes[0] : null; // [] = compte SUPPRIMÉ
  } catch {
    return undefined;                                   // réseau / délai dépassé → on laisse passer
  }
  // On ne met en cache qu'une réponse FERME : un « indéterminé » ne doit pas
  // figer 10 s de doute, il doit être retenté à la requête suivante.
  if (_comptes.size > 500) _comptes.clear();            // borne mémoire par instance
  _comptes.set(id, { at: now, v });
  return v;
}

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

    /* Compte individuel → on relit la LIGNE (voir le long commentaire en tête de
     * fichier). LES DEUX CONDITIONS SONT INDISPENSABLES, chacune écarte un chemin
     * qui n'a PAS de ligne en base et qu'il ne faut surtout pas refuser :
     *   — `UUID.test(id)` écarte le filet « mot de passe d'équipe » (sub
     *     "equipe-mystory", rôle "staff") et le cron Vercel (sub "cron-tick") ;
     *   — le rôle de matrice écarte le jeton de service n8n, dont TOUS les rôles
     *     sont hors matrice (c'est ce qui le fait passer par `estAutomate`) et dont
     *     le `sub` n'est pas lisible depuis le dépôt : sans cette condition, un
     *     `sub` en forme d'UUID aurait fait tomber tous les robots d'un coup.
     * Ne restent donc que les comptes humains adossés à une ligne `utilisateurs`. */
    if (UUID.test(id) && rolesArr.some((r) => ROLES_MATRICE.has(r))) {
      const ligne = await lireCompte(id);
      if (ligne === null || (ligne && !ligne.actif)) return null; // supprimé ou désactivé
      if (ligne) {
        /* ⚠️ UNE RELECTURE NE DOIT JAMAIS ÉLARGIR LES DROITS, seulement les
         * CONFIRMER ou les RETIRER. Signalé par une revue de sécurité le
         * 09/10/2026 sur la première version de ce bloc, et le piège est réel :
         *
         *  — rendre une liste de rôles VIDE aurait ÉLARGI les droits, parce que
         *    « aucun rôle » vaut encore « tous les droits » dans `peutAgir`,
         *    `peutVoirPage` et `estDirection`. Vider les rôles d'un compte en base
         *    — le geste naturel quand quelqu'un s'en va — l'aurait rendu PLUS
         *    puissant. D'où le refus sec si la ligne ne porte plus aucun rôle ;
         *  — reprendre des rôles ABSENTS du jeton aurait élargi aussi. On
         *    intersecte donc avec le jeton : une promotion prend effet à la
         *    prochaine connexion, une rétrogradation mord tout de suite ;
         *  — l'adresse reste CELLE DU JETON, jamais celle de la ligne : c'est elle
         *    que lit `estProprietaire`, et le verrou finance en dépend.
         */
        const enBase = Array.isArray(ligne.roles) && ligne.roles.length > 0
          ? ligne.roles.filter(Boolean)
          : (ligne.role ? [ligne.role] : []);
        const frais = enBase.filter((r) => ROLES_MATRICE.has(r) && rolesArr.includes(r));
        if (frais.length === 0) return null; // plus aucun rôle d'équipe → plus de session
        return { id, email: payload.email as string | undefined, nom, role: frais[0], roles: frais };
      }
      // `undefined` = indéterminé (panne / env absente) → on garde le jeton tel quel.
    }

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
