import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { peutVoirPage } from "@/lib/roles";

/**
 * MYSTORY — Garde d'accès global (v2, harmonisée avec lib/auth.ts).
 * Tout le site (pages + API) exige une session valide — cookie JWT d'équipe
 * OU en-tête Bearer JWT (service n8n) — vérifiée par `verifySession`,
 * SAUF les chemins listés ci-dessous (sécurité propre ou publics par nature).
 */
const CHEMINS_PUBLICS = [
  "/connexion",             // page de connexion
  "/api/auth/login",        // vérification du mot de passe
  "/api/webhooks/docuseal", // DocuSeal : vérifie sa signature HMAC lui-même
  "/qcm",                   // test de positionnement public (stagiaires)
  "/positionnement",
  "/api/positionnement",
  "/suivi",                 // pages stagiaires par jeton non devinable (capability)
  "/evaluation",
  "/fiche-besoin",
  "/satisfaction",          // questionnaire de satisfaction en ligne (jeton)
  "/api/satisfaction",      // dépôt de la réponse (jeton vérifié côté serveur)
  "/emargement/signer",     // signature d'émargement par le stagiaire (jeton/QR)
  "/api/emargement/signer", // dépôt de signature (jeton stagiaire OU session formatrice)
  "/formateur-questionnaire",     // questionnaire formateur en ligne (jeton)
  "/api/formateur-questionnaire", // dépôt des réponses (jeton vérifié côté serveur)
  "/contact",                     // formulaire public « Écrivez-nous » (prospects)
  "/api/contact",                 // dépôt message prospect (GET/PATCH protégés dans la route)
  "/pre-inscription",             // formulaire public de pré-inscription (prospects)
  "/api/pre-inscription",         // dépôt de la demande de pré-inscription (public, honeypot + rate-limit)
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Chemins publics → on laisse passer
  if (
    CHEMINS_PUBLICS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // 2) Session valide (cookie JWT équipe ou Bearer JWT n8n) → on vérifie l'accès à la page
  const utilisateur = await verifySession(req);
  if (utilisateur) {
    // Gating par page selon le rôle. Pages uniquement : les API gardent leurs propres
    // contrôles peut(). Filet de transition : rôle "staff"/absent = accès complet.
    if (!pathname.startsWith("/api/") && !peutVoirPage(utilisateur.role, pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "non_autorise=1";
      return NextResponse.redirect(url);
    }
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

