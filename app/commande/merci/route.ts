/**
 * MYSTORY — GET /commande/merci?r=<uuid>  (page PUBLIQUE)
 *
 * Mollie comme Lenbox renvoient le candidat ici après son règlement — qu'il ait payé,
 * abandonné ou échoué.
 *
 * ⚠️ Cette page ne décide RIEN. Le retour du navigateur n'est pas une preuve de
 * paiement : on peut l'atteindre en tapant l'adresse. Seuls les récepteurs, qui relisent
 * l'état à la source, font foi. On se contente donc de lire l'état déjà enregistré et de
 * dire la vérité au candidat, y compris quand elle est « on vérifie ».
 *
 * Le cas Lenbox mérite son propre message : un financement accepté n'est pas instantané,
 * et annoncer « c'est réglé » à quelqu'un dont le dossier est encore à l'étude lui ferait
 * croire sa place acquise.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, TEL_LIEN } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'habillage vient de lib/pagePublique.ts : pour le candidat, c'est la suite
// immédiate de la page où il vient de régler — elle doit lui ressembler trait pour trait.
const TEL = TEL_PUBLIC;

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("r") ?? "";

  let paye = false;
  let prenom = "";
  let moyen = "";
  let heures = 0;
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const { data } = await supabaseAdmin
      .from("commandes_en_ligne")
      .select("paye_le, candidat_prenom, moyen_paiement, preparation_heures")
      .eq("id", ref)
      .maybeSingle();
    paye = !!(data as any)?.paye_le;
    prenom = String((data as any)?.candidat_prenom ?? "");
    moyen = String((data as any)?.moyen_paiement ?? "");
    heures = Number((data as any)?.preparation_heures ?? 0);
  }

  const corps = paye
    ? `<div class="rond vert">✓</div>
       <h1>C'est réglé${prenom ? `, ${ech(prenom)}` : ""}.</h1>
       <p>Votre commande est confirmée. Vous recevez votre <b>convocation</b> et votre
       <b>facture</b> par e-mail dans les prochaines minutes.</p>
       ${heures > 0 ? `<p>Pour vos <b>${heures} h de préparation</b>, le secrétariat vous
        confirme vos matinées par e-mail — vous n'avez rien à refaire.</p>` : ""}
       <p>Une question ? <b>${TEL}</b></p>`
    : `<div class="rond ambre">⏳</div>
       <h1>Nous vérifions votre règlement</h1>
       ${moyen === "lenbox"
         ? `<p>Votre demande de financement est en cours d'examen. Dès qu'elle est
            acceptée, votre inscription est confirmée et votre convocation part
            automatiquement — sans rien vous demander de plus.</p>`
         : `<p>Si vous venez de payer, votre confirmation arrive par e-mail dans les
            prochaines minutes. Si vous n'avez pas terminé le paiement, votre commande
            est conservée : rappelez-nous et nous la finalisons.</p>`}
       <p>Besoin d'aide tout de suite ?</p>
       <a class="tel" href="tel:${TEL_LIEN}">${TEL}</a>`;

  return new NextResponse(
    pagePublique({ titre: "Votre commande", largeur: 620, corps: `<div class="carte centre">${corps}</div>` }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
