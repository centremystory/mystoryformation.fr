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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEL = "06 81 43 16 54";

function page(corps: string) {
  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Votre commande — MYSTORY Formation</title>
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
       <a class="tel" href="tel:+33681431654">${TEL}</a>`;

  return new NextResponse(page(corps), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
