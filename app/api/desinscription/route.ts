/**
 * MYSTORY — GET /api/desinscription?e=…&s=…
 *
 * Le droit d'opposition, exerçable en un clic depuis le pied d'une campagne.
 *
 * La signature est obligatoire : sans elle, il suffirait d'avoir reçu un seul
 * message pour deviner la forme de l'URL et désinscrire toute la liste.
 *
 * Une signature invalide ne dit d'ailleurs PAS qu'elle est invalide — elle rend
 * la même page que la réussite. Autrement, ce point d'entrée deviendrait un
 * oracle : n'importe qui pourrait tester une adresse et apprendre, à la seule
 * différence du message, si cette personne est cliente chez nous.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signatureValide } from "@/lib/desinscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("e") ?? "").trim().toLowerCase();
  const signature = (req.nextUrl.searchParams.get("s") ?? "").trim();

  if (email && signatureValide(email, signature)) {
    await supabaseAdmin
      .from("desinscriptions")
      .upsert(
        { email, motif: "clic sur le lien de désinscription", source: "campagne" },
        { onConflict: "email" },
      );
  }

  return new NextResponse(page(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function page(): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Désinscription — MYSTORY Formation</title></head>
<body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2430;">
<div style="max-width:520px;margin:0 auto;padding:48px 16px;">
  <div style="background:#2F72DE;color:#fff;border-radius:12px;padding:18px 20px;">
    <div style="font-size:18px;font-weight:bold;">MYSTORY Formation</div>
  </div>
  <div style="background:#fff;border:1px solid #e6e9f0;border-radius:12px;padding:24px 22px;margin-top:12px;line-height:1.6;">
    <h1 style="font-size:19px;margin:0 0 12px;">C'est noté.</h1>
    <p style="font-size:15px;margin:0 0 14px;">
      Vous ne recevrez plus de message de ce type de notre part.
    </p>
    <p style="font-size:14px;color:#4a5768;margin:0;">
      Les messages liés à un dossier en cours — convocation, attestation, facture —
      continuent de vous parvenir&nbsp;: ils ne relèvent pas de la prospection.
      Pour toute question&nbsp;:
      <a href="mailto:secretariat@mystoryformation.fr" style="color:#2F72DE;">secretariat@mystoryformation.fr</a>.
    </p>
  </div>
</div>
</body></html>`;
}
