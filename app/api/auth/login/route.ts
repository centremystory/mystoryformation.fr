import { NextResponse } from "next/server";

/**
 * MYSTORY — Connexion équipe.
 * POST { motDePasse } → si correct, pose le cookie de session signé (30 jours).
 * Variables d'environnement requises (Vercel) : ACCESS_PASSWORD, AUTH_SECRET.
 */

const COOKIE_NAME = "mystory_session";
const TRENTE_JOURS = 60 * 60 * 24 * 30;

/** Même calcul que dans middleware.ts — ne pas modifier l'un sans l'autre. */
async function jetonAttendu(): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "";
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cle,
    enc.encode("mystory-acces-equipe-v1")
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await jetonAttendu(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TRENTE_JOURS,
  });
  return res;
}
