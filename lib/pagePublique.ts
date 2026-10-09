/**
 * MYSTORY — l'habillage des pages PUBLIQUES (celles que voit un candidat).
 *
 * 09/10/2026. Jusqu'ici, chacune des pages publiques portait sa propre fonction
 * `page()` et son propre `const BLEU = "#2F72DE"`. Ce bleu n'existe nulle part sur
 * mystoryformation.fr : le candidat quittait un site soigné et atterrissait, au moment
 * exact de payer, sur ce qui ressemblait au formulaire d'un autre prestataire. Sur une
 * page de paiement ce décrochage se compte en ventes perdues, pas en goût.
 *
 * 🔴 POURQUOI UN SEUL MODULE — à lire avant de recopier trois lignes de CSS « juste
 * pour cette page-là ».
 *
 * Quatre pages avaient quatre copies de la même feuille de style. Elles avaient déjà
 * divergé (rayons, nuances de gris, hauteurs de bouton) sans que personne ne l'ait
 * décidé, simplement parce qu'on corrige celle qu'on a sous les yeux. Une charte qui
 * vit en quatre exemplaires n'est plus une charte. Ici, il y a une seule source : on
 * la change une fois, les cinq pages suivent.
 *
 * La charte est RELEVÉE sur le dépôt du site (`src/app/globals.css`, bloc
 * `@theme inline`) et sur son rendu en production, pas inventée :
 *   — marine institutionnel pour la structure (en-tête, titres, total) ;
 *   — rouge vif pour l'action et rien d'autre (bouton, pastilles, filet sous les titres) ;
 *   — Manrope pour les titres, Inter pour le texte (le site expose Manrope sous la
 *     variable `--font-poppins` : le nom est trompeur, la police est bien Manrope) ;
 *   — boutons en gélule, cartes blanches à bord clair, rayon généreux.
 *
 * ⚠️ Ces pages n'ont PAS Tailwind : ce sont des chaînes HTML renvoyées par des routes.
 * D'où du CSS écrit à la main. Y installer Tailwind reviendrait à réécrire des pages
 * qui encaissent de l'argent aujourd'hui.
 *
 * ⚠️ Les polices viennent de Google Fonts par `<link>`, et la pile de repli est
 * systémique. Si Google Fonts est bloqué ou lent, la page reste lisible et propre :
 * une page de paiement sans sa police est acceptable, sans sa mise en forme non.
 */
import { ech } from "@/lib/html";

/* ------------------------------------------------------------------------- */
/* Les jetons                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Les couleurs de la charte, en TypeScript.
 *
 * Exportées parce que `/test` est une page React (Tailwind) et non une chaîne HTML :
 * elle ne peut pas lire le CSS ci-dessous, mais elle doit porter exactement les mêmes
 * valeurs. C'est la raison d'être de ce bloc — sans lui, la 5e page redeviendrait une
 * 5e charte.
 */
export const CHARTE = {
  /** Bleu marine institutionnel — la structure. */
  marine: {
    50: "#eaeff7", 100: "#c8d5ec", 200: "#97b4de", 300: "#6595cc", 400: "#3d7bb8",
    500: "#2861a0", 600: "#1b4a7a", 700: "#14375e", 800: "#0e2d5c", 900: "#0a2444",
    950: "#051428",
  },
  /** Rouge vif — l'action, et rien que l'action. */
  rouge: {
    50: "#feeaec", 100: "#fcc5c9", 200: "#f88b92", 300: "#f4525b", 400: "#ee2a36",
    500: "#e1192c", 600: "#c00f22", 700: "#9a0a1b", 800: "#780813", 900: "#54050c",
  },
  gris: {
    50: "#f8f9fa", 100: "#f1f3f5", 200: "#e9ecef", 300: "#dee2e6", 400: "#ced4da",
    500: "#adb5bd", 600: "#868e96", 700: "#495057", 800: "#343a40", 900: "#212529",
  },
} as const;

/** La feuille Google Fonts : Inter pour le texte, Manrope pour les titres. */
export const POLICES_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap";

/** Numéro affiché au candidat. Un seul endroit, pour qu'il ne se mette pas à varier. */
export const TEL_PUBLIC = "06 81 43 16 54";
export const TEL_LIEN = "+33681431654";

/**
 * L'adresse de courriel visible par un candidat.
 *
 * Arrêté par le dirigeant le 09/10/2026 : `secretariat@` est l'adresse de
 * l'administratif interne, `contact@` celle des demandes entrantes. Une page
 * commerciale n'affiche donc jamais que `contact@` — et surtout jamais l'adresse
 * Gmail, qui traîne encore dans plusieurs automatisations.
 */
export const COURRIEL_PUBLIC = "contact@mystoryformation.fr";

/** Le site vitrine, vers lequel l'en-tête et le pied renvoient. */
export const SITE = "https://www.mystoryformation.fr";

/**
 * Le bloc légal imposé par l'art. R. 123-237 du code de commerce.
 *
 * SIREN, RCS avec sa ville de greffe et siège social sont obligatoires sur tout
 * document commercial ; l'omission est une contravention de 4e classe. Une page de
 * paiement est un document commercial.
 *
 * ⚠️ Ici on écrit **MY STORY** : c'est la dénomination au greffe. « MYSTORY » est le
 * nom commercial, il a sa place partout ailleurs mais pas dans ce bloc.
 *
 * ⚠️ Le SIREN 844 214 569 et la TVA FR06844214569 sont FAUX et survivent dans de
 * vieux documents. Les seuls bons numéros sont ceux écrits ci-dessous.
 */
export const MENTIONS_LEGALES =
  "MY STORY (enseigne MYSTORY) — SASU au capital de 1 000 € · RCS Paris 913 423 083 · " +
  "SIRET 913 423 083 00017 · TVA FR55 913 423 083 · Siège social : 14 rue Bichat, 75010 Paris · " +
  "Déclaration d'activité n° 11756521775 auprès du préfet de région d'Île-de-France — " +
  "cet enregistrement ne vaut pas agrément de l'État.";

/**
 * L'adresse postale d'un centre, quand nous en annonçons une au candidat.
 *
 * Volontairement limité à Rosny : depuis le 28/09/2026 c'est le SEUL centre d'examen.
 * Gagny et Sarcelles sont des centres de formation — si une session en nommait un
 * autre, mieux vaut n'afficher aucune adresse qu'en afficher une fausse.
 */
export function adresseCentre(nom: string): string {
  return /rosny/i.test(String(nom ?? "")) ? "46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois" : "";
}

/* ------------------------------------------------------------------------- */
/* Le CSS                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Les variables de la charte, seules.
 *
 * Isolées du reste pour que `/test` — qui est en React et en Tailwind — puisse les
 * injecter et écrire `bg-[var(--mys-marine-950)]` sans hériter du CSS des pages HTML.
 */
export const CSS_VARIABLES = `:root{
--mys-marine-50:${CHARTE.marine[50]};--mys-marine-100:${CHARTE.marine[100]};--mys-marine-200:${CHARTE.marine[200]};
--mys-marine-300:${CHARTE.marine[300]};--mys-marine-400:${CHARTE.marine[400]};--mys-marine-500:${CHARTE.marine[500]};
--mys-marine-600:${CHARTE.marine[600]};--mys-marine-700:${CHARTE.marine[700]};--mys-marine-800:${CHARTE.marine[800]};
--mys-marine-900:${CHARTE.marine[900]};--mys-marine-950:${CHARTE.marine[950]};
--mys-rouge-50:${CHARTE.rouge[50]};--mys-rouge-100:${CHARTE.rouge[100]};--mys-rouge-200:${CHARTE.rouge[200]};
--mys-rouge-300:${CHARTE.rouge[300]};--mys-rouge-400:${CHARTE.rouge[400]};--mys-rouge-500:${CHARTE.rouge[500]};
--mys-rouge-600:${CHARTE.rouge[600]};--mys-rouge-700:${CHARTE.rouge[700]};--mys-rouge-800:${CHARTE.rouge[800]};
--mys-gris-50:${CHARTE.gris[50]};--mys-gris-100:${CHARTE.gris[100]};--mys-gris-200:${CHARTE.gris[200]};
--mys-gris-300:${CHARTE.gris[300]};--mys-gris-400:${CHARTE.gris[400]};--mys-gris-500:${CHARTE.gris[500]};
--mys-gris-600:${CHARTE.gris[600]};--mys-gris-700:${CHARTE.gris[700]};--mys-gris-800:${CHARTE.gris[800]};
--mys-gris-900:${CHARTE.gris[900]};
--mys-texte:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
--mys-titre:"Manrope","Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
--mys-rayon:16px;
--mys-ombre:0 1px 2px rgba(10,36,68,.05),0 14px 30px -22px rgba(10,36,68,.45);
--mys-largeur:720px;
}`;

/**
 * Le reste de la feuille : les classes qu'emploient les quatre pages HTML.
 *
 * Les NOMS de classe sont ceux qui existaient déjà (`carte`, `session`, `ligne`,
 * `total`, `moyen`…). C'était délibéré : en gardant le vocabulaire, le changement
 * reste du CSS, le corps des pages bouge à peine, et la relecture du diff montre bien
 * qu'aucune logique n'a été touchée.
 */
const CSS_CHARTE = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--mys-gris-100);color:var(--mys-gris-900);
 font-family:var(--mys-texte);font-size:16px;line-height:1.6;overflow-wrap:break-word;
 -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

/* Le liseré marine puis l'en-tête dégradé : la même entrée en matière que le site,
   pour que le candidat n'ait pas l'impression d'avoir changé d'entreprise. */
.liseret{height:6px;background:var(--mys-marine-950)}
.chapeau{background:linear-gradient(135deg,${CHARTE.marine[950]} 0%,${CHARTE.marine[900]} 45%,${CHARTE.marine[700]} 100%)}
.entete{max-width:var(--mys-largeur);margin:0 auto;padding:14px 16px;
 display:flex;align-items:center;justify-content:space-between;gap:12px}
.marque{display:inline-flex;align-items:center;gap:11px;min-height:44px;text-decoration:none;color:#fff}
.marque img{display:block;width:36px;height:34px;object-fit:contain}
.marque .nom{font-family:var(--mys-titre);font-weight:800;font-size:17px;letter-spacing:.03em;line-height:1.05}
.marque .bl{display:block;font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
 color:rgba(255,255,255,.55);margin-top:3px}
.appel{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 16px;border-radius:999px;
 background:var(--mys-rouge-500);color:#fff;text-decoration:none;font-weight:700;font-size:14px;white-space:nowrap}
.appel:hover{background:var(--mys-rouge-600)}
/* Sous 430 px, la baseline passait à la ligne et écrasait l'en-tête : à cette
   largeur, le nom et le numéro suffisent — c'est de la place rendue au contenu. */
@media(max-width:430px){
 .marque .bl{display:none}
 .marque img{width:32px;height:30px}
 .marque .nom{font-size:16px}
 .appel{padding:0 14px;font-size:13.5px}
 .atouts{gap:6px}
 .atouts span{font-size:11.5px;padding:6px 11px}
}

/* Les trois raisons de ne pas fermer l'onglet. Aucun chiffre : rien qui ne soit
   vérifiable (habilitation CCI, envoi automatique des pièces, paiement sécurisé). */
.atouts{max-width:var(--mys-largeur);margin:0 auto;padding:0 16px 16px;display:flex;flex-wrap:wrap;gap:8px}
.atouts span{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;
 background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
 font-size:12px;font-weight:600;color:rgba(255,255,255,.9)}
.atouts i{font-style:normal;color:${CHARTE.rouge[300]};font-weight:800}

.enveloppe,.env{max-width:var(--mys-largeur);margin:0 auto;padding:22px 16px 48px}

.carte{background:#fff;border:1px solid var(--mys-gris-200);border-radius:var(--mys-rayon);
 padding:22px 20px;margin-bottom:16px;box-shadow:var(--mys-ombre)}
.carte.centre{text-align:center}
@media(max-width:400px){.carte{padding:18px 15px}}

h1{font-family:var(--mys-titre);font-weight:800;font-size:25px;line-height:1.2;letter-spacing:-.015em;
 color:var(--mys-marine-900);margin:0 0 10px}
/* Le filet rouge sous le titre est la signature du site : c'est lui, plus que la
   couleur de fond, qui fait reconnaître la page au premier coup d'œil. */
h1::after{content:"";display:block;width:46px;height:4px;border-radius:999px;
 background:var(--mys-rouge-500);margin:13px 0 4px}
.carte.centre h1::after{margin-left:auto;margin-right:auto}
.h1b{font-size:20px}
h2{font-family:var(--mys-titre);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.14em;
 color:var(--mys-rouge-600);margin:26px 0 8px}
p{margin:10px 0;line-height:1.65}
.sous{color:var(--mys-gris-700);font-size:15px;margin:0 0 16px;line-height:1.6}
a{color:var(--mys-marine-600)}

label{display:block;font-size:13px;font-weight:600;color:var(--mys-marine-800);margin:16px 0 6px}
input,select,textarea{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--mys-gris-300);
 border-radius:12px;font-size:16px;background:#fff;font-family:inherit;color:var(--mys-gris-900);
 transition:border-color .15s,box-shadow .15s}
input::placeholder{color:var(--mys-gris-500)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--mys-marine-500);
 box-shadow:0 0 0 3px rgba(40,97,160,.18)}
/* Les cases et boutons radio ne sont pas des champs de saisie : ils ne prennent ni la
   largeur ni la hauteur minimale imposées plus haut, sinon ils deviennent des pavés. */
input[type=radio],input[type=checkbox]{width:auto;min-height:0;accent-color:var(--mys-rouge-500)}
select{appearance:none;-webkit-appearance:none;padding-right:42px;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.6 6 6.4l5-4.8' fill='none' stroke='%23495057' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
 background-repeat:no-repeat;background-position:right 15px center}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:520px){.duo{grid-template-columns:1fr}}
.obl{color:var(--mys-rouge-500)}
.hp{position:absolute;left:-9999px}

.session{background:var(--mys-marine-50);border:1px solid var(--mys-marine-100);border-radius:14px;
 padding:14px 16px;margin-bottom:10px}
.session .t{font-family:var(--mys-titre);font-weight:800;font-size:16px;line-height:1.3;color:var(--mys-marine-900)}
.session .d{color:var(--mys-marine-600);font-size:14px;margin-top:4px;line-height:1.5}
.session .ou{display:block;color:var(--mys-marine-500);font-size:13px;margin-top:5px}

.ligne{display:flex;justify-content:space-between;gap:14px;font-size:15px;padding:11px 0;
 border-bottom:1px solid var(--mys-gris-200)}
.ligne:last-child{border-bottom:0}
.ligne b{white-space:nowrap;color:var(--mys-marine-900);font-variant-numeric:tabular-nums}
.ligne small{display:block;color:var(--mys-gris-600);font-size:12.5px;margin-top:3px}
/* Le total : c'est le chiffre qu'on vient chercher. Il est sorti du tableau, posé sur
   le marine de la marque, et il est le plus gros texte de la page. */
.total{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-top:12px;
 padding:15px 18px;border-radius:14px;background:var(--mys-marine-900);color:#fff}
.total span:first-child{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;
 color:rgba(255,255,255,.65)}
.total span:last-child{font-family:var(--mys-titre);font-weight:800;font-size:27px;line-height:1;
 font-variant-numeric:tabular-nums}

.urgence{background:#fff8ec;border:1px solid #f6dcae;border-radius:12px;padding:12px 14px;
 font-size:13.5px;color:#7a4a00;margin-top:12px;line-height:1.55}
.note{font-size:12.5px;color:var(--mys-gris-600);margin-top:16px;line-height:1.65}
.err{background:var(--mys-rouge-50);border:1px solid var(--mys-rouge-200);color:var(--mys-rouge-800);
 border-radius:12px;padding:13px 15px;font-size:14.5px;font-weight:500;margin-bottom:14px;line-height:1.55}
.ok{background:#e7f6ed;border:1px solid #b6e4c6;color:#12713a;border-radius:14px;padding:20px;text-align:center}

button{width:100%;margin-top:24px;min-height:56px;padding:16px 20px;border:0;border-radius:999px;
 background:var(--mys-rouge-500);color:#fff;font-family:var(--mys-titre);font-size:16px;font-weight:800;
 cursor:pointer;box-shadow:0 12px 26px -14px rgba(225,25,44,.75);transition:background .15s,transform .06s}
button:hover{background:var(--mys-rouge-600)}
button:active{transform:translateY(1px)}
button:disabled{opacity:.6;cursor:progress;box-shadow:none}

.mat{display:flex;justify-content:space-between;gap:12px;font-size:14.5px;padding:10px 0;
 border-bottom:1px solid var(--mys-gris-200)}
.mat.pleine{color:var(--mys-rouge-800);text-decoration:line-through;text-decoration-color:var(--mys-rouge-200)}
.mat.pleine span.r{text-decoration:none;font-weight:700}

.moyens{display:grid;gap:10px;margin-top:10px}
.moyen{display:flex;gap:12px;align-items:flex-start;cursor:pointer;background:#fff;padding:14px 16px;
 border:1.5px solid var(--mys-gris-300);border-radius:14px;transition:border-color .15s,background .15s}
.moyen:hover{border-color:var(--mys-marine-300)}
/* Le choix retenu se voit : sans cette règle, deux gélules grises identiques laissent
   le candidat se demander ce qu'il a coché juste avant de payer. */
.moyen:has(input:checked){border-color:var(--mys-rouge-500);background:var(--mys-rouge-50)}
.moyen input{margin-top:4px;flex:0 0 auto}
.moyen .l{display:block;font-family:var(--mys-titre);font-weight:800;font-size:15.5px;color:var(--mys-marine-900)}
.moyen .m{display:block;color:var(--mys-gris-700);font-size:13.5px;margin-top:4px;line-height:1.55}

.rond{width:64px;height:64px;border-radius:50%;margin:0 auto 18px;display:flex;align-items:center;
 justify-content:center;font-size:30px}
.vert{background:#e7f6ed;color:#12713a}
.ambre{background:#fff4e2;color:#8a5200}
.tel{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;margin-top:18px;
 padding:14px 26px;border-radius:999px;background:var(--mys-rouge-500);color:#fff;text-decoration:none;
 font-family:var(--mys-titre);font-weight:800;font-size:16px;box-shadow:0 12px 26px -14px rgba(225,25,44,.75)}

.pied{background:var(--mys-marine-950);color:rgba(255,255,255,.55);padding:26px 16px 36px;
 font-size:11.5px;line-height:1.75}
.pied .dedans{max-width:var(--mys-largeur);margin:0 auto}
.pied a{color:rgba(255,255,255,.78)}
.pied .liens{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 12px;padding:0;list-style:none}
.pied .liens a{font-weight:600;text-decoration:none}
.pied .liens a:hover{text-decoration:underline}
`;

/* ------------------------------------------------------------------------- */
/* L'enveloppe                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Le logo, servi par l'optimiseur d'images de Next.
 *
 * Le PNG d'origine pèse 125 ko — sur une page ouverte depuis une publicité TikTok en
 * 4G, c'est du temps de chargement payé pour un logo de 36 pixels. La même image par
 * `/_next/image` sort en WebP de 3 ko.
 */
const LOGO = "/_next/image?url=%2Flogo-mystory-blanc.png&w=96&q=75";
const LOGO_2X = "/_next/image?url=%2Flogo-mystory-blanc.png&w=192&q=75";

/** L'en-tête de marque, commun aux cinq pages publiques. */
function chapeau(atouts: boolean): string {
  return `<div class="liseret"></div>
<div class="chapeau">
  <div class="entete">
    <a class="marque" href="${SITE}">
      <img src="${LOGO}" srcset="${LOGO} 1x, ${LOGO_2X} 2x" width="36" height="34" alt="" aria-hidden="true">
      <span class="nom">MYSTORY<span class="bl">Votre histoire, notre fierté</span></span>
    </a>
    <a class="appel" href="tel:${TEL_LIEN}">${TEL_PUBLIC}</a>
  </div>
  ${atouts ? `<div class="atouts">
    <span><i>✓</i>Centre d'examen habilité par la CCI Paris Île-de-France</span>
    <span><i>✓</i>Convocation et facture par e-mail</span>
    <span><i>✓</i>Paiement sécurisé</span>
  </div>` : ""}
</div>`;
}

/** Le pied de page, qui porte le bloc légal obligatoire sur TOUTES les pages. */
function pied(): string {
  return `<footer class="pied"><div class="dedans">
  <ul class="liens">
    <li><a href="${SITE}/mentions-legales">Mentions légales</a></li>
    <li><a href="${SITE}/conditions-generales-de-vente">Conditions générales de vente</a></li>
    <li><a href="${SITE}/politique-de-confidentialite">Confidentialité</a></li>
    <li><a href="mailto:${COURRIEL_PUBLIC}">${COURRIEL_PUBLIC}</a></li>
  </ul>
  <p style="margin:0">${MENTIONS_LEGALES}</p>
</div></footer>`;
}

/**
 * L'enveloppe d'une page publique : tout ce qui n'est pas son contenu propre.
 *
 * @param titre    titre de l'onglet (échappé ici — les appelants n'ont pas à y penser)
 * @param corps    le HTML déjà construit par la page
 * @param largeur  largeur du contenu : 720 px pour un formulaire, 620 px pour un
 *                 message court, qui serait illisible étalé sur toute la largeur
 * @param atouts   masque le bandeau de réassurance (page de refus, par exemple)
 */
export function pagePublique({
  titre, corps, largeur = 720, atouts = true,
}: { titre: string; corps: string; largeur?: number; atouts?: boolean }): string {
  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${CHARTE.marine[950]}">
<title>${ech(titre)} — MYSTORY Formation</title>
<link rel="icon" href="/_next/image?url=%2Fembleme-bleu.png&w=64&q=75">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${POLICES_HREF}">
<style>${CSS_VARIABLES}
:root{--mys-largeur:${largeur}px}
${CSS_CHARTE}</style></head><body>
${chapeau(atouts)}
<main class="enveloppe">${corps}</main>
${pied()}
</body></html>`;
}
