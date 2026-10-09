/**
 * MYSTORY — GET /api/rendez-vous/confirmer  (PUBLIC, lien signé)
 *
 * Le candidat clique le bouton de son courriel : son rendez-vous devient ferme.
 *
 * ── POURQUOI CE DÉTOUR EXISTE ──────────────────────────────────────────────────
 * Une revue de sécurité a relevé, le 09/10/2026, qu'une réservation en ligne sans
 * preuve d'adresse ouvre deux dégâts : on peut saturer les agendas des trois agences
 * pour des semaines (et un rendez-vous ne se périmait jamais), et on peut nous faire
 * envoyer des courriels à des tiers depuis notre domaine — ce qui, si
 * contact@mystoryformation.fr se fait classer en indésirable, ferait cesser d'arriver
 * les CONVOCATIONS D'EXAMEN. On a déjà vécu cette panne les 09 et 10/09/2026.
 *
 * Un clic sur un lien signé règle les deux : seul quelqu'un qui lit vraiment la boîte
 * indiquée peut rendre un créneau définitif, et un créneau non confirmé retombe au
 * bout de `DELAI_CONFIRMATION_HEURES` (voir `libererRendezVousNonConfirmes`).
 *
 * ── CE QUI EST DÉLIBÉRÉMENT ABSENT ─────────────────────────────────────────────
 * Aucun CAPTCHA, ici comme à la réservation. La stratégie du dirigeant est un
 * parcours qui réserve sans conseiller et sans faire fuir personne ; un CAPTCHA à
 * l'entrée d'un rendez-vous commercial coûterait plus de rendez-vous qu'il n'en
 * protégerait. Les plafonds et la péremption bornent déjà le dégât.
 *
 * ── POURQUOI UNE PAGE HTML DANS UNE ROUTE D'API ────────────────────────────────
 * Parce que ce lien est cliqué depuis un client de messagerie, sur un téléphone. Ce
 * qui arrive à l'écran doit être lisible par un humain, pas du JSON. Une page de
 * quelques lignes, sans dépendance, répond mieux qu'une page Next qu'il faudrait
 * router, protéger et styler.
 *
 * ⚠️ Méthode GET, donc rejouable : des clients de messagerie PRÉ-CHARGENT les liens
 * pour les analyser, et le candidat clique parfois deux fois. `confirmerRdv()` est
 * donc idempotente, et un second appel répond « déjà confirmé » sans rien réécrire.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  jetonRdvValide, confirmerRdv, agence, jourLisible, heureLisible,
  situationTitre, DUREE_RDV_MINUTES,
} from "@/lib/rendezVous";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEL = "06 81 43 16 54";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("r") ?? "";
  const signature = req.nextUrl.searchParams.get("s") ?? "";

  // 🔴 La signature AVANT toute lecture en base. Sans elle, cette route serait un
  // moyen de confirmer le rendez-vous de n'importe qui en devinant un identifiant —
  // et surtout de contourner exactement la preuve d'adresse qu'elle sert à établir.
  if (!id || !jetonRdvValide(id, signature)) {
    return page(
      "Ce lien n'est pas valable",
      `<p>Le lien a peut-être été coupé par votre logiciel de messagerie. Réessayez en
        cliquant directement sur le bouton du message, ou appelez-nous au
        <a href="tel:+33681431654">${TEL}</a> : nous confirmons votre rendez-vous
        en trente secondes.</p>`,
      400,
    );
  }

  const r = await confirmerRdv(id);

  if (r.etat === "inconnu") {
    return page(
      "Rendez-vous introuvable",
      `<p>Nous ne retrouvons pas ce rendez-vous. Appelez-nous au
        <a href="tel:+33681431654">${TEL}</a>, nous le reprenons avec vous.</p>`,
      404,
    );
  }

  if (r.etat === "perime") {
    // On ne ressuscite PAS un rendez-vous annulé : le créneau a pu être repris
    // entre-temps, et le réveiller mettrait deux personnes sur la même chaise.
    return page(
      "Ce créneau a été rendu",
      `<p>Faute de confirmation à temps, votre créneau a été rendu — il est peut-être
        déjà pris par quelqu'un d'autre.</p>
       <p>Vous pouvez en choisir un autre tout de suite sur
        <a href="https://www.mystoryformation.fr/rendez-vous">mystoryformation.fr/rendez-vous</a>,
        ou nous appeler au <a href="tel:+33681431654">${TEL}</a>.</p>`,
      410,
    );
  }

  const rdv = (r.rdv ?? {}) as Record<string, string>;
  const a = agence(String(rdv.agence ?? ""));
  const sit = situationTitre(String(rdv.situation_titre ?? ""));
  const quand = rdv.date_rdv
    ? `${jourLisible(String(rdv.date_rdv))} à ${heureLisible(String(rdv.heure))}`
    : "";

  if (r.etat === "confirme") {
    await journal(id, "rdv_confirme_par_le_candidat", { agence: rdv.agence, date: rdv.date_rdv, heure: rdv.heure });
  }

  return page(
    r.etat === "deja_confirme" ? "C'était déjà confirmé" : "C'est confirmé, merci !",
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

async function journal(id: string, evenement: string, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "rendez_vous", entite_id: id, evenement,
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
 * moteur de recherche.
 */
function page(titre: string, corps: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
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
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
