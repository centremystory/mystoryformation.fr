import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * MYSTORY — Garde d'accès global.
 * Tout le site (pages + API) exige le cookie de session d'équipe,
 * SAUF les chemins listés ci-dessous, qui ont leur propre sécurité
 * ou qui sont publics par nature.
 */
const CHEMINS_PUBLICS = [
  "/connexion",            // page de connexion
  "/api/auth/login",       // vérification du mot de passe
  "/api/webhooks/docuseal", // DocuSeal : vérifie sa signature HMAC lui-même
  "/api/conventions/send", // n8n : vérifie son Bearer token lui-même
  "/positionnement",       // test de positionnement public (stagiaires)
  "/api/positionnement",
];

const COOKIE_NAME = "mystory_session";

/** Jeton attendu = HMAC-SHA256(AUTH_SECRET, message fixe), en hexadécimal. */
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Chemins publics → on laisse passer
  if (
    CHEMINS_PUBLICS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // 2) Cookie de session valide → on laisse passer
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === (await jetonAttendu())) {
    return NextResponse.next();
  }

  // 3) Sinon : API → 401, page → redirection vers /connexion
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Tout, sauf les fichiers statiques de Next.js et les images/assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)).*)",
  ],
};
