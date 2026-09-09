/**
 * MYSTORY — Authentification des partenaires prescripteurs.
 *
 * 09/09/2026 — le portail passait par un jeton dans l'URL. Un jeton d'URL se
 * transmet par courriel, se colle dans une conversation, reste dans l'historique
 * d'un poste partage. Pour un portail qui contient des PIECES D'IDENTITE, ce n'est
 * pas assez : on passe a une adresse et un mot de passe.
 *
 * COOKIE DISTINCT, et c'est le point qui compte. Une session partenaire ne doit
 * JAMAIS ouvrir le CRM. Si l'on reutilisait le cookie de l'equipe, un partenaire
 * authentifie atteindrait toutes les routes internes : le middleware ne verifie que
 * la presence d'une session valide. Deux publics, deux cookies, deux secrets de
 * signature dans le meme AUTH_SECRET mais avec une AUDIENCE differente.
 */
import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "./supabaseAdmin";

export const COOKIE_PRESCRIPTEUR = "mystory_partenaire";
const AUDIENCE = "prescripteur";           // ce qui empeche la confusion des deux publics
const DUREE = 60 * 60 * 24 * 7;            // 7 jours : un partenaire se reconnecte souvent

export interface SessionPrescripteur {
  id: string;
  raison_sociale: string;
  email: string;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET manquant");
  return new TextEncoder().encode(s);
}

/** Cree le jeton de session d'un partenaire. */
export async function signerSession(p: SessionPrescripteur): Promise<string> {
  return new SignJWT({ email: p.email, raison_sociale: p.raison_sociale })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.id)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${DUREE}s`)
    .sign(secret());
}

export function optionsCookie(maxAge = DUREE) {
  return {
    httpOnly: true, secure: true, sameSite: "lax" as const,
    path: "/", maxAge,
  };
}

/**
 * Resout le partenaire d'une requete, ou null.
 *
 * L'audience est verifiee : un jeton d'equipe presente ici est rejete, et
 * reciproquement. C'est ce qui empeche qu'une session serve dans l'autre monde.
 */
export async function sessionPrescripteur(req: Request): Promise<SessionPrescripteur | null> {
  const brut = req.headers.get("cookie") ?? "";
  const m = brut.match(new RegExp(`(?:^|;\\s*)${COOKIE_PRESCRIPTEUR}=([^;]+)`));
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(decodeURIComponent(m[1]), secret(), { audience: AUDIENCE });
    if (!payload.sub) return null;
    // On relit la base : un partenaire desactive depuis l'emission du jeton doit
    // perdre l'acces immediatement, sans attendre l'expiration.
    const { data } = await supabaseAdmin
      .from("partenaires").select("id, raison_sociale, email, actif")
      .eq("id", payload.sub).maybeSingle();
    if (!data || !data.actif) return null;
    return { id: data.id, raison_sociale: data.raison_sociale, email: data.email ?? "" };
  } catch {
    return null;   // jeton expire, mal signe, ou d'une autre audience
  }
}
