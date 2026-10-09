/**
 * MYSTORY — GET /participation/merci?j=<jeton>  (page PUBLIQUE, retour de Mollie)
 *
 * Où le candidat atterrit après la page de règlement.
 *
 * ── 🔴 CETTE PAGE N'AFFIRME RIEN QU'ELLE N'AIT LU EN BASE ───────────────────
 *
 * Mollie renvoie le candidat sur cette adresse **quoi qu'il arrive** : paiement
 * réussi, abandonné, refusé par la banque, ou simple clic sur « retour ». Le
 * redirect n'est donc PAS une preuve de paiement — et c'est le piège classique
 * du retour de paiement : écrire « merci, c'est payé » parce que le candidat est
 * arrivé là.
 *
 * On relit donc l'état EN BASE, c'est-à-dire ce que le webhook a écrit après
 * avoir relu Mollie à la source. Trois cas :
 *
 *   — réglée  → on confirme, et c'est vrai ;
 *   — due     → le webhook n'est pas encore passé (quelques secondes, parfois
 *               plus) OU le paiement a échoué. On ne tranche pas entre les deux :
 *               on dit l'attente et on renvoie vers la page de paiement, qui
 *               reste valable. Annoncer un échec à quelqu'un qui vient de payer
 *               est pire qu'annoncer une attente à quelqu'un qui a abandonné ;
 *   — exonérée / hors CPF → l'équipe a tranché entre-temps ; rien n'est dû.
 *
 * Déclarée publique dans middleware.ts (sous `/participation`).
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import {
  ouvrirLien, contexteDossier, etatParticipation, euros, TICKET_MODERATEUR,
} from "@/lib/liensCandidat";
import { refusLienHtml } from "@/lib/liensCandidatPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("j") ?? "";
  const lien = await ouvrirLien(jeton, "participation");
  if (!lien) return refusLienHtml("Votre participation CPF");

  const c = await contexteDossier(lien.dossierId);
  if (!c) return refusLienHtml("Votre participation CPF");

  const etat = etatParticipation(c);
  const retourPaiement = `/participation?j=${encodeURIComponent(jeton)}`;

  const corps = etat === "reglee"
    ? `<div class="carte centre">
  <div class="rond vert">✓</div>
  <h1>Merci, c'est réglé</h1>
  <p class="sous">Votre participation de <b>${ech(euros(TICKET_MODERATEUR))}</b> est enregistrée.
  Vous recevez un reçu par e-mail dans les prochaines minutes à l'adresse
  <b>${ech(c.email)}</b>.</p>
  <p class="sous">Vous n'avez plus rien à régler : le reste de votre formation est pris en
  charge par votre compte personnel de formation. Notre secrétariat enchaîne sur votre
  convention de formation, que vous recevrez à signer.</p>
  <p class="note">Une question ? Appelez-nous au <b>${TEL_PUBLIC}</b> ou écrivez à
  <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>.</p>
</div>`
    : etat === "due"
    ? `<div class="carte centre">
  <div class="rond ambre">⏳</div>
  <h1>Nous vérifions votre paiement</h1>
  <p class="sous">Nous n'avons pas encore reçu la confirmation de notre prestataire bancaire.
  C'est souvent l'affaire de quelques minutes — et si vous avez renoncé en cours de route,
  rien n'a été débité.</p>
  <p class="sous">Rechargez cette page dans un instant, ou revenez à la page de paiement :
  elle reste valable.</p>
  <a class="tel" href="${ech(retourPaiement)}">Revenir à ma page de paiement</a>
  <p class="note">Si le montant a bien été débité et que rien ne change d'ici une heure,
  appelez-nous au <b>${TEL_PUBLIC}</b> : nous vérifions avec notre prestataire et
  régularisons. <b>Ne payez pas une seconde fois.</b></p>
</div>`
    : `<div class="carte centre">
  <div class="rond vert">✓</div>
  <h1>Vous n'avez rien à régler</h1>
  <p class="sous">Votre dossier a été mis à jour : la participation de
  ${ech(euros(TICKET_MODERATEUR))} ne vous est pas réclamée. Si vous venez de payer malgré
  tout, appelez-nous au <b>${TEL_PUBLIC}</b> — nous vous remboursons.</p>
</div>`;

  return new NextResponse(
    pagePublique({ titre: "Votre participation CPF", corps, largeur: 620, atouts: false }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
