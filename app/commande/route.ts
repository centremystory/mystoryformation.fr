/**
 * MYSTORY — GET /commande  (page PUBLIQUE)
 *
 * 09/10/2026. Le site vitrine propose depuis aujourd'hui un parcours de réservation
 * complet : le candidat choisit son examen, sa date, ses matinées de préparation et
 * ses options, et voit son total. Mais il ne pouvait pas PAYER : le CRM ne savait
 * encaisser qu'une seule session, par `/inscription-examen?session=<id>`. Une commande
 * composée partait donc chez un conseiller, qui envoyait le lien à la main — et une
 * commande qui attend un humain est une commande qu'on perd le soir et le week-end.
 *
 * Cette page est le pendant de `/inscription-examen` pour une commande composée :
 * récapitulatif au montant RECALCULÉ ici, formulaire candidat (mêmes champs), puis
 * création du paiement au POST.
 *
 *   ?session=<uuid>          session TEF IRN, si commandée
 *   &session_civique=<uuid>  session d'examen civique, si commandée
 *   &mention=CSP|CR|NAT      obligatoire dès que le civique est commandé
 *   &preparation=<heures>    3, 6, 9 ou 12 — absent s'il n'y a pas de préparation
 *   &matinees=AAAA-MM-JJ,…   exactement preparation/3 dates
 *   &options=passetontef,prepmyfuture,prepcivique
 *
 * AUCUN MONTANT NE CIRCULE DANS CETTE URL, volontairement. Tout est recalculé par
 * `lireCommande()` — tarifs d'examen, règle des 7 jours ouvrés, prix de la
 * préparation, prix des plateformes, places restantes des matinées. Si le total
 * diverge de ce que le site a affiché, c'est le CRM qui a raison.
 *
 * Aucun secret, aucune donnée d'un autre candidat : la page ne lit que des sessions
 * publiques. Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { euros, jourLisible } from "@/lib/inscriptionEnLigne";
import { MOTIVATIONS_CCI } from "@/lib/inscriptionEnLigne";
import {
  lireCommande, matineesDisponibles, CAPACITE_MATINEE, MATINEE_HORAIRE,
  FENETRE_MATINEES_JOURS, MENTIONS_PAR_CODE, dateExamenLaPlusProche, type Commande,
} from "@/lib/commande";
import { fractionnePour } from "@/lib/lenbox";
import { ech } from "@/lib/html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLEU = "#2F72DE";
const TEL = "06 81 43 16 54";

function page(titre: string, corps: string) {
  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${ech(titre)} — MYSTORY Formation</title>
<style>
  :root{--bleu:${BLEU};}
  *{box-sizing:border-box;}
  body{margin:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2430;}
  .bandeau{background:var(--bleu);color:#fff;padding:18px 20px;}
  .bandeau b{font-size:17px;letter-spacing:.2px;}
  .enveloppe{max-width:720px;margin:0 auto;padding:22px 16px 60px;}
  .carte{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:20px;margin-bottom:16px;}
  h1{font-size:21px;margin:0 0 6px;}
  h2{font-size:15px;margin:22px 0 2px;color:#334;}
  .sous{color:#667;font-size:14px;margin:0 0 14px;line-height:1.5;}
  label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px;}
  input,select{width:100%;padding:11px 12px;border:1px solid #cfd6e4;border-radius:9px;font-size:16px;background:#fff;font-family:inherit;color:inherit;}
  input:focus,select:focus{outline:2px solid var(--bleu);outline-offset:1px;border-color:var(--bleu);}
  .duo{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  @media(max-width:520px){.duo{grid-template-columns:1fr;}}
  .session{background:#eef3fe;border:1px solid #cfe0ff;border-radius:12px;padding:14px 16px;margin-bottom:10px;}
  .session .t{font-weight:700;font-size:16px;color:#16325c;}
  .session .d{color:#44608f;font-size:14px;margin-top:3px;}
  .ligne{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px solid #eef1f7;}
  .ligne:last-child{border-bottom:0;}
  .ligne small{display:block;color:#7a8296;font-size:12px;margin-top:2px;}
  .total{display:flex;justify-content:space-between;font-weight:700;font-size:17px;padding-top:10px;margin-top:4px;border-top:2px solid #1f2430;}
  .urgence{background:#fff4e5;border:1px solid #ffd9a8;border-radius:10px;padding:11px 13px;font-size:13px;color:#7a4a00;margin-top:10px;line-height:1.5;}
  .obl{color:#c00;}
  button{width:100%;margin-top:22px;padding:15px;border:0;border-radius:11px;background:var(--bleu);color:#fff;font-size:16px;font-weight:700;cursor:pointer;}
  button:disabled{opacity:.55;cursor:progress;}
  .hp{position:absolute;left:-9999px;}
  .note{font-size:12px;color:#7a8296;margin-top:16px;line-height:1.6;}
  .err{background:#fdeaea;border:1px solid #f5c2c2;color:#8a1c1c;border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:14px;line-height:1.5;}
  .mat{display:flex;justify-content:space-between;font-size:14px;padding:8px 0;border-bottom:1px solid #eef1f7;}
  .mat.pleine{color:#8a1c1c;text-decoration:line-through;text-decoration-color:#e0a0a0;}
  .mat.pleine span.r{text-decoration:none;font-weight:600;}
  .moyens{display:grid;gap:10px;margin-top:10px;}
  .moyen{border:1px solid #cfd6e4;border-radius:11px;padding:13px 15px;display:flex;gap:11px;align-items:flex-start;cursor:pointer;}
  .moyen input{width:auto;margin-top:3px;flex:0 0 auto;}
  .moyen .l{font-weight:700;font-size:15px;}
  .moyen .m{color:#667;font-size:13px;margin-top:3px;line-height:1.5;}
  a{color:var(--bleu);}
</style></head><body>
<div class="bandeau"><b>MYSTORY Formation</b></div>
<div class="enveloppe">${corps}</div>
</body></html>`;
}

function opts(liste: readonly string[]) {
  return liste.map((o) => `<option value="${ech(o)}">${ech(o)}</option>`).join("");
}

/**
 * La page de refus.
 *
 * Elle DIT la raison. Un candidat qui a rempli un parcours entier et qui tombe sur
 * « une erreur est survenue » appelle, ou s'en va : dans les deux cas on a perdu la
 * vente. Quand le refus vient d'une matinée complète, on montre en plus la fenêtre
 * de matinées avec les complètes barrées — c'est la réponse utile, pas un diagnostic.
 */
async function refus(erreurs: string[], dateExamen: string | null, centre: string | null) {
  let liste = "";
  if (dateExamen) {
    const mat = await matineesDisponibles(dateExamen, centre ?? undefined);
    if (mat.length) {
      liste = `<h2>Les matinées de cet examen</h2>
      <p class="sous">Une matinée accueille ${CAPACITE_MATINEE} personnes au maximum, du lundi au
      samedi, de ${MATINEE_HORAIRE}.</p>
      <div>${mat.map((m) => `
        <div class="mat${m.restantes <= 0 ? " pleine" : ""}">
          <span>${ech(m.label)}${m.memeJour ? " <b>(matin de votre examen)</b>" : ""}</span>
          <span class="r">${m.restantes > 0 ? `${m.restantes} place${m.restantes > 1 ? "s" : ""}` : "complète"}</span>
        </div>`).join("")}</div>`;
    }
  }

  return new NextResponse(
    page("Commande à revoir", `<div class="carte">
      <h1>Nous ne pouvons pas valider cette commande</h1>
      ${erreurs.map((e) => `<div class="err">${ech(e)}</div>`).join("")}
      <p class="sous">Reprenez votre choix sur
      <a href="https://www.mystoryformation.fr/prochaines-sessions-examen">le calendrier des sessions</a>,
      ou appelez-nous au <b>${TEL}</b> — nous finalisons votre inscription avec vous.</p>
      ${liste}
    </div>`),
    { status: 409, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** Le récapitulatif, ligne à ligne, au montant recalculé. */
function recapitulatif(c: Commande): string {
  const sessions = [
    c.tef ? `<div class="session">
        <div class="t">TEF IRN — ${ech(jourLisible(c.tef.date_examen))}</div>
        <div class="d">${ech(c.tef.horaire)} · ${ech(c.tef.centre_nom)}</div>
      </div>` : "",
    c.civique ? `<div class="session">
        <div class="t">Examen civique — ${ech(jourLisible(c.civique.date_examen))}</div>
        <div class="d">${ech(c.civique.horaire)} · ${ech(c.civique.centre_nom)} · mention ${ech(c.mention)}</div>
      </div>` : "",
    c.matinees.length ? `<div class="session">
        <div class="t">Préparation — ${c.heures} h en ${c.matinees.length} matinée${c.matinees.length > 1 ? "s" : ""}</div>
        <div class="d">${ech(MATINEE_HORAIRE)} · ${c.matinees.map((m) => ech(jourLisible(m))).join(" · ")}</div>
      </div>` : "",
  ].join("");

  const lignes = c.lignes.map((l) => `<div class="ligne">
      <span>${ech(l.libelle)}</span><b>${euros(l.prix)}</b>
    </div>`).join("");

  return `<div class="carte">
  <h1>Votre commande</h1>
  <p class="sous">Vérifiez votre récapitulatif, renseignez vos informations, puis réglez.
  Vous recevrez votre convocation et votre facture par e-mail dès le règlement enregistré.</p>
  ${sessions}
  <h2>Montant</h2>
  <div style="margin-top:8px">${lignes}
    <div class="total"><span>Total</span><span>${euros(c.montant)}</span></div>
  </div>
  ${c.heures > 0 ? `<p class="note">L'examen TEF IRN est <b>compris dans la préparation</b> : il n'est
   pas facturé en plus. Les ${c.heures} h se tiennent dans nos locaux, de ${ech(MATINEE_HORAIRE)}.</p>` : ""}
  ${c.urgence ? `<div class="urgence"><b>Tarif d'urgence.</b> Une de vos dates a lieu dans moins de
   7 jours ouvrés : nous rouvrons une liste déjà arrêtée, prévenons la CCI et produisons votre
   convocation dans la journée.</div>` : ""}
</div>`;
}

/**
 * Le choix du moyen de paiement.
 *
 * Carte bancaire toujours (Mollie, qui présente aussi Klarna dès lors que le paiement
 * porte son détail de commande et son adresse de facturation — voir lib/mollie.ts).
 * Fractionné Lenbox en plus, quand il est permis.
 *
 * Le fractionné est PRIVILÉGIÉ par le dirigeant, et pas pour une question de commission :
 * Lenbox verse l'argent sous 48 h en une seule fois — la trésorerie n'attend pas les
 * échéances du client — et c'est Lenbox qui porte le risque d'impayé et gère les litiges.
 * Avec Klarna via Mollie, nous restons le commerçant. Pour une entreprise dont le compte
 * est tendu, ces deux points pèsent plus que quelques dixièmes de pourcent.
 *
 * `fractionnePour()` tranche : seuil, bornes, configuration, et surtout le délai de
 * rétractation de 14 jours. Quand il écarte le fractionné pour cette raison, on AFFICHE
 * la raison — une option qui disparaît en silence passe pour une option qui n'existe pas,
 * alors que c'est un argument pour réserver plus tôt.
 *
 * Les mensualités affichées sont celles que le candidat paiera VRAIMENT, frais client
 * compris. Jamais `total / 4`.
 */
function moyensDePaiement(c: Commande): string {
  const total = c.montant;
  const { echeanciers, motif } = fractionnePour(total, dateExamenLaPlusProche(c));

  if (echeanciers.length === 0) {
    return `<input type="hidden" name="moyen" value="mollie">
    ${motif ? `<p class="note"><b>Paiement en plusieurs fois :</b> ${ech(motif)}</p>` : ""}`;
  }

  return `<h2>Comment souhaitez-vous régler ?</h2>
  <div class="moyens">
    <label class="moyen">
      <input type="radio" name="moyen" value="mollie" checked>
      <span><span class="l">En une fois — ${euros(total)}</span>
      <span class="m">Carte bancaire ou Klarna, paiement sécurisé. Votre convocation part dès le
      règlement enregistré.</span></span>
    </label>
    ${echeanciers.map((e) => `
    <label class="moyen">
      <input type="radio" name="moyen" value="lenbox:${ech(e.code)}">
      <span><span class="l">En ${e.fois} fois — ${euros(e.mensualite)} par mois</span>
      <span class="m">${e.fois} échéances de ${euros(e.mensualite)}${e.derniere !== e.mensualite ? ` (dernière : ${euros(e.derniere)})` : ""},
      soit <b>${euros(e.totalClient)}</b> au total, frais de financement compris. Financement Lenbox,
      sous réserve d'acceptation.</span></span>
    </label>`).join("")}
  </div>`;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = {
    session: q.get("session"),
    session_civique: q.get("session_civique"),
    mention: q.get("mention"),
    preparation: q.get("preparation"),
    matinees: q.get("matinees"),
    options: q.get("options"),
  };

  const lu = await lireCommande(p);
  if (!lu.ok) {
    // Pour la liste des matinées : on a besoin de la date d'examen, qu'on relit de
    // façon minimale. Si la session elle-même est en cause, on n'affiche pas de liste.
    const { lireSession } = await import("@/lib/inscriptionEnLigne");
    const s = p.session ? await lireSession(String(p.session)) : null;
    return refus(lu.erreurs ?? [], s?.date_examen ?? null, s?.centre?.toUpperCase() ?? null);
  }
  const c = lu.commande as Commande;

  const corps = `
${recapitulatif(c)}

<form id="f" class="carte" novalidate>
  <div id="erreur"></div>
  <h1 style="font-size:18px">Vos informations</h1>
  <p class="sous">Elles sont transmises à la CCI Paris Île-de-France pour votre inscription :
  merci de les saisir <b>exactement comme sur votre pièce d'identité</b>.</p>

  <div class="duo">
    <div><label for="civilite">Civilité <span class="obl">*</span></label>
      <select id="civilite" name="civilite" required><option value="">—</option>
        <option>Madame</option><option>Monsieur</option></select></div>
    <div><label for="genre">Genre <span class="obl">*</span></label>
      <select id="genre" name="genre" required><option value="">—</option>
        <option>Femme</option><option>Homme</option></select></div>
  </div>

  <div class="duo">
    <div><label for="nom">NOM <span class="obl">*</span></label>
      <input id="nom" name="nom" required autocomplete="family-name"></div>
    <div><label for="prenom">Prénom <span class="obl">*</span></label>
      <input id="prenom" name="prenom" required autocomplete="given-name"></div>
  </div>

  <div class="duo">
    <div><label for="date_naissance">Date de naissance <span class="obl">*</span></label>
      <input id="date_naissance" name="date_naissance" type="date" required></div>
    <div><label for="lieu_naissance">Lieu de naissance <span class="obl">*</span></label>
      <input id="lieu_naissance" name="lieu_naissance" required placeholder="Ville, pays"></div>
  </div>

  <div class="duo">
    <div><label for="nationalite">Nationalité <span class="obl">*</span></label>
      <input id="nationalite" name="nationalite" required></div>
    <div><label for="langue_maternelle">Langue maternelle <span class="obl">*</span></label>
      <input id="langue_maternelle" name="langue_maternelle" required></div>
  </div>

  <div class="duo">
    <div><label for="telephone">Téléphone <span class="obl">*</span></label>
      <input id="telephone" name="telephone" type="tel" required autocomplete="tel" placeholder="06 …"></div>
    <div><label for="email">E-mail <span class="obl">*</span></label>
      <input id="email" name="email" type="email" required autocomplete="email"></div>
  </div>

  <label for="adresse">Adresse <span class="obl">*</span></label>
  <input id="adresse" name="adresse" required autocomplete="street-address">

  <div class="duo">
    <div><label for="code_postal">Code postal <span class="obl">*</span></label>
      <input id="code_postal" name="code_postal" required inputmode="numeric" autocomplete="postal-code"></div>
    <div><label for="ville">Ville <span class="obl">*</span></label>
      <input id="ville" name="ville" required autocomplete="address-level2"></div>
  </div>

  <label for="pays">Pays <span class="obl">*</span></label>
  <input id="pays" name="pays" required value="France" autocomplete="country-name">

  <h2>Votre examen</h2>
  ${c.tef ? `
  <label for="sous_type">Motivation de votre examen TEF IRN <span class="obl">*</span></label>
  <select id="sous_type" name="sous_type" required><option value="">—</option>${opts(MOTIVATIONS_CCI)}</select>`
  : `<input type="hidden" name="sous_type" value="">`}
  ${c.civique ? `<p class="note">Mention d'examen civique retenue : <b>${ech(c.mention)}</b>.</p>` : ""}
  <label for="piece_identite">${c.tef ? "Numéro de votre pièce d'identité" : "Numéro étranger"} <span class="obl">*</span></label>
  <input id="piece_identite" name="piece_identite" required>
  <p class="note">La pièce elle-même n'est pas à téléverser : elle sera vérifiée sur place le jour
  de l'examen. Présentez-vous avec l'original en cours de validité.</p>

  ${moyensDePaiement(c)}

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>

  <!-- La commande repart telle qu'elle est arrivée, SANS AUCUN MONTANT : le serveur
       recalcule tout à la réception. Ce qui est ici n'est qu'un choix, jamais un prix. -->
  <input type="hidden" name="session" value="${ech(c.tef?.id ?? "")}">
  <input type="hidden" name="session_civique" value="${ech(c.civique?.id ?? "")}">
  <input type="hidden" name="mention" value="${ech(Object.keys(MENTIONS_PAR_CODE).find((k) => MENTIONS_PAR_CODE[k] === c.mention) ?? "")}">
  <input type="hidden" name="preparation" value="${ech(c.heures || "")}">
  <input type="hidden" name="matinees" value="${ech(c.matinees.join(","))}">
  <input type="hidden" name="options" value="${ech(c.options.join(","))}">

  <button id="b" type="submit">Continuer vers le paiement · ${euros(c.montant)}</button>
  <p class="note">En validant, vous acceptez que ces informations servent à votre inscription à
  l'examen et soient transmises à la CCI Paris Île-de-France. Conservation 5 ans. Droits d'accès et
  de rectification : contact@mystoryformation.fr.<br>
  Une matinée de préparation accueille ${CAPACITE_MATINEE} personnes au maximum et se tient dans les
  ${FENETRE_MATINEES_JOURS} jours précédant votre examen.<br>
  MYSTORY (SASU) — SIRET 913 423 083 00017 — NDA 11756521775 (ne vaut pas agrément de l'État).</p>
</form>

<script>
var f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('erreur');
/* Le message vient de notre propre route, mais on l'insère en texte et jamais en HTML :
   une erreur affichée ne doit pas pouvoir exécuter quoi que ce soit dans la page. */
function afficherErreur(texte){
  e.textContent='';
  var d=document.createElement('div');
  d.className='err';
  d.textContent=texte;
  e.appendChild(d);
  window.scrollTo({top:0,behavior:'smooth'});
}
f.addEventListener('submit',async function(ev){
  ev.preventDefault();
  e.textContent='';
  var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
  var manquants=[];
  f.querySelectorAll('[required]').forEach(function(el){ if(!String(el.value).trim()) manquants.push(el); });
  if(manquants.length){
    afficherErreur('Merci de remplir tous les champs obligatoires.');
    manquants[0].focus(); return;
  }
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/commande',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j && j.ok && j.paiement){ window.location.href=j.paiement; return; }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Une erreur est survenue. Appelez-nous au ${TEL}, nous finalisons votre commande.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au ${TEL}.');
  }
  b.disabled=false; b.textContent='Continuer vers le paiement';
});
</script>`;

  return new NextResponse(page("Votre commande", corps), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
