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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'échappement est partagé (lib/html.ts) : voir le commentaire qui l'accompagne.

function page(corps: string) {
  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Votre inscription — MYSTORY Formation</title>
<style>
  body{margin:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2430;}
  .bandeau{background:#2F72DE;color:#fff;padding:18px 20px;font-weight:700;font-size:17px;}
  .env{max-width:620px;margin:0 auto;padding:26px 16px 60px;}
  .carte{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:26px;text-align:center;}
  h1{font-size:21px;margin:0 0 10px;}
  p{line-height:1.6;color:#445;margin:10px 0;}
  .rond{width:58px;height:58px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:29px;}
  .vert{background:#e9f7ee;color:#157a3a;}
  .ambre{background:#fff4e5;color:#a05b00;}
  .tel{display:inline-block;margin-top:16px;background:#2F72DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;}
</style></head><body>
<div class="bandeau">MYSTORY Formation</div><div class="env"><div class="carte">${corps}</div></div>
</body></html>`;
}

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
       <p style="color:#667;font-size:14px">Le jour de l'examen, présentez-vous 15 minutes avant
       avec votre pièce d'identité originale en cours de validité.</p>`
    : `<div class="rond ambre">⏳</div>
       <h1>Nous vérifions votre paiement</h1>
       <p>Votre banque ne nous a pas encore confirmé le règlement. C'est fréquent et cela prend
       généralement moins d'une minute — <b>ne payez pas une seconde fois</b>.</p>
       <p>Dès la confirmation reçue, votre convocation part automatiquement par e-mail.</p>
       <p style="color:#667;font-size:14px">Si vous avez interrompu le paiement, votre place reste
       réservée quelques heures : rappelez-nous pour la confirmer.</p>
       <a class="tel" href="tel:+33681431654">06 81 43 16 54</a>`;

  return new NextResponse(page(corps), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
