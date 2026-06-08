/**
 * MYSTORY — middleware.ts (racine du projet)
 * ------------------------------------------
 * Protège PAR DÉFAUT toutes les routes sensibles. Une route oubliée ne peut pas être exposée :
 * tout ce qui matche ci-dessous exige une session valide AVANT d'atteindre le handler.
 *
 * Couvre /api/documents/* (génération de documents) et /api/conventions/* (envoi en signature).
 * Le webhook DocuSeal (/api/webhooks/docuseal) n'est PAS ici : il s'authentifie par signature HMAC
 * dans son propre handler (il ne porte pas de session utilisateur).
 *
 * Pour ajouter un nouveau périmètre protégé : étends `matcher` ci-dessous.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const user = await verifySession(req);
  if (!user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  // Propage l'identité au handler (évite une 2e vérif si souhaité).
  const headers = new Headers(req.headers);
  headers.set("x-user-id", user.id);
  if (user.role) headers.set("x-user-role", user.role);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Tout /api/documents/* et /api/conventions/* est protégé par défaut.
  matcher: ["/api/documents/:path*", "/api/conventions/:path*"],
};
