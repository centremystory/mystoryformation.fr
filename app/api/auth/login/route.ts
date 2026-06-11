import { NextResponse } from "next/server";
import { SignJWT } from "jose";

/**
 * MYSTORY — Connexion équipe (v2, harmonisée avec lib/auth.ts).
 * POST { motDePasse } → si correct, pose un cookie de session contenant un JWT
 * signé avec AUTH_SECRET, valable 30 jours. Ce JWT est reconnu par
 * `verifySession` / `requireUser` (lib/auth.ts) : middleware ET routes parlent
 * désormais la même langue.
 *
 * Env requises (Vercel) : ACCESS_PASSWORD, AUTH_SECRET.
 */

const COOKIE_NAME = process.env.AUTH_COOKIE ?? "mystory_session";
const TRENTE_JOURS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  if (!process.env.ACCESS_PASSWORD || !process.env.AUTH_SECRET) {
    return NextResponse.json(
      { erreur: "Configuration serveur incomplète (ACCESS_PASSWORD / AUTH_SECRET)" },
      { status: 500 }
    );
  }

  const corps = await req.json().catch(() => ({} as { motDePasse?: string }));
  const motDePasse = typeof corps?.motDePasse === "string" ? corps.motDePasse : "";

  if (motDePasse !== process.env.ACCESS_PASSWORD) {
    return NextResponse.json({ erreur: "Mot de passe incorrect" }, { status: 401 });
  }

  const jwt = await new SignJWT({ role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("equipe-mystory")
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TRENTE_JOURS,
  });
  return res;
}
