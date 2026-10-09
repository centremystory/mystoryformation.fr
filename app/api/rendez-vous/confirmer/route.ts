/**
 * MYSTORY — GET /api/rendez-vous/confirmer?j=<jeton>  (PUBLIC)
 *
 * Le candidat clique le bouton de son courriel : son rendez-vous devient ferme.
 *
 * ── POURQUOI CE DÉTOUR EXISTE ──────────────────────────────────────────────────
 * Une réservation en ligne sans preuve d'adresse ouvre deux dégâts : on peut saturer
 * les agendas des trois agences (et un rendez-vous ne se périmait jamais), et on peut
 * nous faire envoyer des courriels à des tiers depuis notre domaine — ce qui, si
 * contact@mystoryformation.fr se fait classer en indésirable, ferait cesser d'arriver
 * les CONVOCATIONS D'EXAMEN. On a vécu cette panne les 09 et 10/09/2026.
 *
 * Un clic sur un lien que seul le titulaire de la boîte a reçu règle les deux : un
 * créneau non confirmé se rend tout seul au bout de `DELAI_CONFIRMATION_HEURES`.
 *
 * ── 🔴 UNE SEULE RÉPONSE POUR TOUS LES REFUS ───────────────────────────────────
 * Jeton inconnu, jeton déjà consommé, jeton périmé, rendez-vous annulé : la page est
 * la MÊME. Distinguer les cas donnerait un oracle, et sur ce public-là l'enjeu est
 * réel — nos candidats sont des personnes en démarche de naturalisation, et
 * « cette personne a rendez-vous chez vous » est une information qu'on ne confirme à
 * personne, pas même par une nuance de formulation.
 *
 * Le détail du refus est JOURNALISÉ, pas affiché.
 *
 * ── CE QUI EST DÉLIBÉRÉMENT ABSENT ─────────────────────────────────────────────
 * Aucun CAPTCHA, ici comme à la réservation : la stratégie du dirigeant est un
 * parcours qui réserve sans conseiller et sans faire fuir personne. Un jeton de
 * 256 bits n'a pas besoin d'être protégé contre le devinage — il y a 10⁷⁷ valeurs.
 *
 * ── POURQUOI UNE PAGE HTML DANS UNE ROUTE D'API ────────────────────────────────
 * Parce que ce lien est cliqué depuis un client de messagerie, sur un téléphone. Ce
 * qui arrive à l'écran doit être lisible par un humain, pas du JSON.
 *
 * ⚠️ Méthode GET, donc rejouable : des antivirus de messagerie PRÉ-CHARGENT les
 * liens, et les gens cliquent deux fois. Le jeton est à usage unique en base (il est
 * effacé), mais `confirmerParJeton` rend quand même le rendez-vous au premier appel
 * — l'écran est donc identique au premier et au second clic, alors que la base n'a
 * été écrite qu'une fois. Le second clic, lui, tombe sur le refus commun : c'est le
 * prix d'un jeton à usage unique, et il vaut mieux que l'inverse.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  confirmerParJeton, agence, jourLisible, heureLisible,
  situationTitre, DUREE_RDV_MINUTES,
} from "@/lib/rendezVous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEL = "06 81 43 16 54";

export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("j") ?? "";

  const r = await confirmerParJeton(jeton);

  if (!r.ok) {
    /* On ne dit NI pourquoi, NI si ce jeton a jamais existé. Un seul message, pour
       tous les cas — et une sortie qui ne laisse personne sans solution. */
    await journal(null, "rdv_confirmation_refusee", { longueur_jeton: jeton.length });
    return page(
      "Ce lien n'est plus valable",
      `<p>Il a peut-être déjà servi, ou votre créneau a été rendu faute de
        confirmation à temps.</p>
       <p>Reprenez un rendez-vous en trente secondes sur
        <a href="https://www.mystoryformation.fr/rendez-vous">mystoryformation.fr/rendez-vous</a>,
        ou appelez-nous au <a href="tel:+33681431654">${TEL}</a> — nous le prenons
        avec vous.</p>`,
      410,
    );
  }

  const rdv = (r.rdv ?? {}) as Record<string, string>;
  const a = agence(String(rdv.agence ?? ""));
  const sit = situationTitre(String(rdv.situation_titre ?? ""));
  const quand = rdv.date_rdv
    ? `${jourLisible(String(rdv.date_rdv))} à ${heureLisible(String(rdv.heure))}`
    : "";

  await journal(String(rdv.id ?? ""), "rdv_confirme_par_le_candidat", {
    agence: rdv.agence, date: rdv.date_rdv, heure: rdv.heure,
  });

  return page(
    "C'est confirmé, merci !",
    `<p style="font-size:17px"><b>${ech(quand)}</b><br>
      ${a ? `${ech(a.nom)} — ${ech(a.adresse)}` : ""}</p>
     <p style="color:#4b5563">Comptez environ ${DUREE_RDV_MINUTES} minutes sur place.</p>
     ${sit
        ? `<p style="background:#eef3fd;border-left:3px solid #2F72DE;padding:12px 14px;border-radius:8px;text-align:left">
             <b>À apporter :</b> ${ech(sit.aApporter)}.
           </p>`
        : ""}
     <p style="color:#6b7280;font-size:14px">Un empêchement ? Prévenez-nous au
       <a href="tel:+33681431654">${TEL}</a> — votre créneau servira à quelqu'un d'autre.</p>`,
  );
}

async function journal(id: string | null, evenement: string, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "rendez_vous", entite_id: id || null, evenement,
      nouvelle_valeur: detail, auteur: "candidat",
    });
  } catch {
    /* le journal ne doit jamais faire échouer une confirmation */
  }
}

/**
 * La page rendue au candidat. Volontairement autonome : aucun script, aucune feuille
 * de style distante, aucune police à télécharger. Elle s'ouvre dans le navigateur
 * intégré d'une application de messagerie, souvent sur un réseau médiocre — tout ce
 * qu'elle a à faire, c'est s'afficher du premier coup.
 *
 * `noindex` : cette page porte une date de rendez-vous, elle n'a rien à faire dans un
 * moteur de recherche. `Referrer-Policy` : sans elle, le jeton partirait dans
 * l'en-tête `Referer` de chaque lien sortant de cette page.
 */
function page(titre: string, corps: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${ech(titre)} — MYSTORY FORMATION</title>
</head>
<body style="margin:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2430">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#2F72DE;color:#fff;border-radius:14px;padding:20px 22px">
    <div style="font-size:19px;font-weight:bold">MYSTORY Formation</div>
    <div style="font-size:13px;opacity:.92">Votre rendez-vous</div>
  </div>
  <div style="background:#fff;border:1px solid #e6e9f0;border-radius:14px;padding:22px;margin-top:12px;text-align:center;line-height:1.6;font-size:15px">
    <h1 style="font-size:20px;margin:0 0 14px">${ech(titre)}</h1>
    ${corps}
  </div>
  <p style="text-align:center;margin-top:16px">
    <a href="https://www.mystoryformation.fr" style="color:#2F72DE;font-size:14px">mystoryformation.fr</a>
  </p>
</div>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Le jeton est dans l'URL : il ne doit pas voyager dans un `Referer`.
      "Referrer-Policy": "no-referrer",
    },
  });
}
