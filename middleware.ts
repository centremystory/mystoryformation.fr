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
  // 17/09/2026 — le droit d'opposition doit s'exercer SANS compte. Un lien de
  // désinscription qui aboutit sur une page de connexion n'est pas un droit
  // exerçable, c'est un obstacle — et la signature HMAC protège déjà l'adresse.
  "/desinscription",
  "/api/desinscription",
  "/api/pre-inscription",         // dépôt de la demande de pré-inscription (public, honeypot + rate-limit)
  "/inscription-examen",          // page publique d'inscription à une session (28/09/2026)
  "/api/inscription-examen",      // dépôt du formulaire d'inscription en ligne (honeypot + rate-limit)
  "/api/paiements/mollie",        // webhook Mollie : ne transmet qu'un identifiant, l'état est relu à la source
  // 09/10/2026 — la commande composée (examen(s) + préparation + plateformes). Même
  // nature que /inscription-examen : le candidat n'a pas de compte, et la page ne lit
  // que des sessions publiques. Aucun montant ne circule dans l'URL, tout est recalculé.
  "/commande",                    // page publique de commande + sa page de retour /commande/merci
  "/api/commande",                // dépôt du formulaire + webhook /api/commande/paiement (honeypot + rate-limit)
  // 09/10/2026 — le rendez-vous au bureau, réservé seul depuis le site vitrine.
  // Appelée EN CROSS-ORIGIN par mystoryformation.fr (site 100 % statique, donc
  // incapable de recevoir un POST). La route porte sa propre défense : liste
  // fermée d'origines, honeypot, limite par IP, plafond par adresse e-mail, et
  // revalidation du créneau contre la grille d'ouverture. Le GET ne rend que des
  // heures — jamais un nom, un téléphone ou une situation de titre de séjour.
  "/api/rendez-vous",
  // Récepteur Lenbox (paiement fractionné). Public par nécessité : Lenbox appelle sans
  // s'authentifier. ⚠️ La route ne croit JAMAIS le corps du POST — aucune signature
  // n'existe côté Lenbox — elle relit le statut du dossier à la source. Voir la route.
  "/api/paiements/lenbox",
  "/partenaire",                  // portail partenaire par jeton (capability)
  "/api/partenaire",              // données + dépôts partenaire (jeton vérifié côté serveur)
  // Portail des organismes prescripteurs. Public au sens du middleware d'ÉQUIPE
  // seulement : ces routes portent leur propre authentification (cookie et audience
  // JWT distincts, cf. lib/prescripteurAuth.ts), pour qu'une session partenaire
  // n'ouvre jamais le CRM.
  "/prescripteur",
  "/api/prescripteur",
  "/politique-confidentialite",   // politique de confidentialité publique (RGPD art. 13)
  "/test",                        // test initial : accueil, inscription candidat, passation par jeton
  "/api/tests/kiosque",           // auto-enregistrement candidat (rate-limité)
  "/api/tests/code",              // résolution code court → jeton (test final, rate-limité)
  "/api/tests/passation",         // passation par jeton (capability)
  "/api/tests/oral",              // dépôt des audios (jeton)
  "/api/tests/audio",             // upload audio (jeton)
  "/api/tests/contact",           // coordonnées laissées en fin de test (jeton + statut vérifiés)
  "/api/tests/civique",           // enchaînement TEF IRN → examen civique (jeton)
  // Notation par lien signé : la formatrice corrige EE/EO depuis son téléphone, sans
  // compte. La signature HMAC de l'identifiant est vérifiée dans la route elle-même,
  // et elle est distincte du jeton de passation que le candidat connaît.
  "/tests/corriger",
  "/api/tests/corriger",
  // 09/10/2026 (soir) — les quatre pages à LIEN NOMINATIF envoyées au candidat :
  // voie de vérification d'identité, devis finalisé, participation forfaitaire CPF
  // de 150 €, relecture de l'état civil. Chacune s'ouvre sur un jeton de 32 octets
  // d'aléa rangé en base (table `liens_candidat`, migration 84), vérifié DANS la
  // route — type, péremption et révocation compris.
  //
  // ⚠️ Publiques au sens du middleware seulement : le candidat n'a pas de compte,
  // mais rien ne s'ouvre sans un jeton nominatif, et chaque jeton n'ouvre qu'UNE
  // porte (le type est vérifié, sinon un lien de coordonnées ouvrirait
  // l'acceptation du devis). Un refus ne dit JAMAIS laquelle des raisons
  // s'applique : « ce dossier existe » est déjà une information qu'on ne confirme
  // à personne, s'agissant de démarches de titre de séjour.
  //
  // 🔴 `/api/liens-candidat` — qui FABRIQUE ces jetons — n'est volontairement PAS
  // dans cette liste : elle exige une session d'équipe. L'y ajouter donnerait à
  // n'importe qui le moyen de s'ouvrir un lien vers n'importe quel dossier.
  "/identite",                    // choix de la voie (en ligne / courrier / les deux)
  "/api/identite",                // dépôt du choix (honeypot + limite par IP)
  "/devis",                       // « votre devis est finalisé » + acceptation horodatée
  "/api/devis",                   // dépôt de l'acceptation (instantané figé côté serveur)
  "/participation",               // participation forfaitaire CPF + sa page de retour /merci
  "/api/participation",           // ouverture du paiement, demande d'exonération,
                                  // et webhook /api/participation/paiement (Mollie : ne
                                  // transmet qu'un identifiant, l'état est relu à la source)
  "/coordonnees",                 // relecture de l'état civil, pré-remplie
  "/api/coordonnees",             // dépôt de la confirmation ou des corrections
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

