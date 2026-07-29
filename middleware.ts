import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { accesPage, accesPageAvec } from "@/lib/roles";

/**
 * Permissions effectives (défauts code + overrides DB) — le middleware Edge n'a pas d'accès
 * DB, il lit donc la map via l'endpoint PUBLIC /api/permissions/public. Cache module 30 s
 * (par instance Edge) + Cache-Control côté endpoint. Fallback = défauts code (accesPage).
 */
let _permCache: { at: number; map: Record<string, string[]> } | null = null;
async function mapPermissions(origin: string): Promise<Record<string, string[]> | null> {
  const now = Date.now();
  if (_permCache && now - _permCache.at < 30000) return _permCache.map;
  try {
    const r = await fetch(`${origin}/api/permissions/public`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j?.ok && j.map) { _permCache = { at: now, map: j.map }; return j.map; }
    }
  } catch { /* réseau indispo → on retombe sur le cache ou les défauts */ }
  return _permCache?.map ?? null;
}

/**
 * MYSTORY — Garde d'accès global (v2, harmonisée avec lib/auth.ts).
 * Tout le site (pages + API) exige une session valide — cookie JWT d'équipe
 * OU en-tête Bearer JWT (service n8n) — vérifiée par `verifySession`,
 * SAUF les chemins listés ci-dessous (sécurité propre ou publics par nature).
 */
const CHEMINS_PUBLICS = [
  "/connexion",             // page de connexion
  "/api/auth/login",        // vérification du mot de passe
  "/api/auth/mot-de-passe-oublie", // demande de réinitialisation
  "/api/auth/reinitialiser", // pose du nouveau mot de passe
  "/reinitialiser",         // page publique de réinitialisation
  "/api/webhooks/docuseal", // DocuSeal : vérifie sa signature HMAC lui-même
  "/qcm",                   // test de positionnement public (stagiaires)
  "/positionnement",
  "/api/positionnement",
  "/suivi",                 // pages stagiaires par jeton non devinable (capability)
  "/evaluation",
  "/fiche-besoin",
  "/satisfaction",          // questionnaire de satisfaction en ligne (jeton)
  "/api/satisfaction",      // dépôt de la réponse (jeton vérifié côté serveur)
  "/avis-cours",            // satisfaction à chaud du cours (stagiaire, jeton de séance)
  "/api/satisfaction-cours/repondre", // dépôt de l'avis à chaud (jeton vérifié côté serveur)
  "/api/permissions/public", // map effective des permissions (lue par le middleware lui-même)
  "/emargement/signer",     // signature d'émargement par le stagiaire (jeton/QR)
  "/api/emargement/signer", // dépôt de signature (jeton stagiaire OU session formatrice)
  "/formateur-questionnaire",     // questionnaire formateur en ligne (jeton)
  "/api/formateur-questionnaire", // dépôt des réponses (jeton vérifié côté serveur)
  "/contact",                     // formulaire public « Écrivez-nous » (prospects)
  "/api/contact",                 // dépôt message prospect (GET/PATCH protégés dans la route)
  "/pre-inscription",             // formulaire public de pré-inscription (prospects)
  "/api/pre-inscription",         // dépôt de la demande de pré-inscription (public, honeypot + rate-limit)
  "/partenaire",                  // portail partenaire par jeton (capability)
  "/api/partenaire",              // données + dépôts partenaire (jeton vérifié côté serveur)
  "/politique-confidentialite",   // politique de confidentialité publique (RGPD art. 13)
  "/test",                        // test initial : accueil, inscription candidat, passation par jeton
  "/api/tests/kiosque",           // auto-enregistrement candidat (rate-limité)
  "/api/tests/code",              // résolution code court → jeton (test final, rate-limité)
  "/api/tests/passation",         // passation par jeton (capability)
  "/api/tests/oral",              // dépôt des audios (jeton)
  "/api/tests/audio",             // upload audio (jeton)
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0) Sous-domaines publics (testinitiale. / testfinale.mystoryformation.fr) :
  //    la racine du sous-domaine mène directement au bon parcours. Les chemins profonds
  //    (/test/[token], API…) passent ensuite par les règles habituelles.
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (pathname === "/") {
    if (host.startsWith("test.") || host.startsWith("testinitiale.") || host.startsWith("testinitial.")) {
      const url = req.nextUrl.clone(); url.pathname = "/test";
      return NextResponse.rewrite(url);
    }
    if (host.startsWith("testfinale.") || host.startsWith("testfinal.")) {
      const url = req.nextUrl.clone(); url.pathname = "/test/finale";
      return NextResponse.rewrite(url);
    }
  }

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
    if (!pathname.startsWith("/api/")) {
      const map = await mapPermissions(req.nextUrl.origin);
      const autorise = map
        ? accesPageAvec(utilisateur.roles ?? utilisateur.role, utilisateur.email, pathname, map)
        : accesPage(utilisateur.roles ?? utilisateur.role, utilisateur.email, pathname);
      if (!autorise) {
        const url = req.nextUrl.clone();
        url.pathname = "/acces-refuse";
        url.search = "";
        return NextResponse.redirect(url);
      }
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

