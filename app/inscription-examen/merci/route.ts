/**
 * MYSTORY — GET /inscription-examen/merci?r=<uuid>  (page PUBLIQUE)
 *
 * Mollie renvoie le candidat ici après le règlement — qu'il ait payé, abandonné ou échoué.
 *
 * ⚠️ Cette page ne décide RIEN. Le retour du navigateur n'est pas une preuve de paiement :
 * on peut l'atteindre en tapant l'adresse. Seul le webhook, qui relit l'état chez Mollie,
 * fait foi. On se contente donc de lire l'état déjà enregistré et de dire la vérité au
 * candidat, y compris quand elle est « on vérifie ».
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, TEL_LIEN } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'échappement est partagé (lib/html.ts) : voir le commentaire qui l'accompagne.
// L'habillage l'est aussi (lib/pagePublique.ts) : c'est la MÊME page, pour le
// candidat, que celle où il vient de payer — elle doit lui ressembler trait pour trait.

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("r") ?? "";

  let paye = false;
  let nom = "";
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const { data } = await supabaseAdmin
      .from("preinscriptions_examen")
      .select("paye_le, candidat_prenom")
      .eq("id", ref)
      .maybeSingle();
    paye = !!(data as any)?.paye_le;
    nom = String((data as any)?.candidat_prenom ?? "");
  }

  const corps = paye
    ? `<div class="rond vert">✓</div>
       <h1>C'est réglé${nom ? `, ${ech(nom)}` : ""}.</h1>
       <p>Votre inscription est confirmée. Vous recevez votre <b>convocation</b> et votre
       <b>facture</b> par e-mail dans les prochaines minutes.</p>
       <p>Pensez à vérifier vos courriers indésirables si vous ne voyez rien arriver.</p>
       <p class="note">Le jour de l'examen, présentez-vous 15 minutes avant
       avec votre pièce d'identité originale en cours de validité.</p>`
    : `<div class="rond ambre">⏳</div>
       <h1>Nous vérifions votre paiement</h1>
       <p>Votre banque ne nous a pas encore confirmé le règlement. C'est fréquent et cela prend
       généralement moins d'une minute — <b>ne payez pas une seconde fois</b>.</p>
       <p>Dès la confirmation reçue, votre convocation part automatiquement par e-mail.</p>
       <p class="note">Si vous avez interrompu le paiement, votre place reste
       réservée quelques heures : rappelez-nous pour la confirmer.</p>
       <a class="tel" href="tel:${TEL_LIEN}">${TEL_PUBLIC}</a>`;

  return new NextResponse(
    pagePublique({ titre: "Votre inscription", largeur: 620, corps: `<div class="carte centre">${corps}</div>` }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
