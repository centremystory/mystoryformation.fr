/**
 * MYSTORY — GET /inscription-examen?session=<uuid>  (page PUBLIQUE)
 *
 * 28/09/2026. Remplace les trois liens Qonto génériques du site, qui encaissaient
 * sans rien demander : ni nom, ni session, ni motivation CCI, ni numéro de pièce.
 * On recevait un virement au nom porté sur la carte, sans savoir qui se présenterait.
 *
 * Ici le candidat donne d'abord tout ce dont l'inscription a besoin — exactement les
 * champs de la « Page Candidat » du formulaire n8n — et paie ensuite. Le montant est
 * calculé SERVEUR d'après la grille : il n'est jamais accepté depuis le navigateur.
 *
 * Pas de copie de pièce d'identité : elle est vérifiée sur place le jour de l'examen.
 *
 * Aucun secret ici, aucune donnée d'un autre candidat : la page ne lit qu'une session
 * publique. Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { calculerMontant } from "@/lib/tarifsExamen";
import {
  MOTIVATIONS_CCI, MENTIONS_CIVIQUE, lireSession, jourLisible, euros,
} from "@/lib/inscriptionEnLigne";
import { ech } from "@/lib/html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLEU = "#2F72DE";

// 09/10/2026 — l'échappement vit désormais dans lib/html.ts : il était en double
// dans ce dépôt, et deux copies finissent par diverger. Comportement identique.

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
  input,select,textarea{width:100%;padding:11px 12px;border:1px solid #cfd6e4;border-radius:9px;font-size:16px;background:#fff;font-family:inherit;color:inherit;}
  input:focus,select:focus{outline:2px solid var(--bleu);outline-offset:1px;border-color:var(--bleu);}
  .duo{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  @media(max-width:520px){.duo{grid-template-columns:1fr;}}
  .session{background:#eef3fe;border:1px solid #cfe0ff;border-radius:12px;padding:14px 16px;}
  .session .t{font-weight:700;font-size:16px;color:#16325c;}
  .session .d{color:#44608f;font-size:14px;margin-top:3px;}
  .ligne{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px solid #eef1f7;}
  .ligne:last-child{border-bottom:0;}
  .total{display:flex;justify-content:space-between;font-weight:700;font-size:17px;padding-top:10px;margin-top:4px;border-top:2px solid #1f2430;}
  .urgence{background:#fff4e5;border:1px solid #ffd9a8;border-radius:10px;padding:11px 13px;font-size:13px;color:#7a4a00;margin-top:10px;line-height:1.5;}
  .obl{color:#c00;}
  button{width:100%;margin-top:22px;padding:15px;border:0;border-radius:11px;background:var(--bleu);color:#fff;font-size:16px;font-weight:700;cursor:pointer;}
  button:disabled{opacity:.55;cursor:progress;}
  .hp{position:absolute;left:-9999px;}
  .note{font-size:12px;color:#7a8296;margin-top:16px;line-height:1.6;}
  .err{background:#fdeaea;border:1px solid #f5c2c2;color:#8a1c1c;border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:14px;}
  .ok{background:#e9f7ee;border:1px solid #b6e4c6;color:#155e2e;border-radius:12px;padding:20px;text-align:center;}
  a{color:var(--bleu);}
</style></head><body>
<div class="bandeau"><b>MYSTORY Formation</b></div>
<div class="enveloppe">${corps}</div>
</body></html>`;
}

function opts(liste: readonly string[]) {
  return liste.map((o) => `<option value="${ech(o)}">${ech(o)}</option>`).join("");
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("session") ?? "";
  const s = await lireSession(id);

  if (!s) {
    return new NextResponse(
      page("Session indisponible", `<div class="carte">
        <h1>Cette session n'est plus disponible</h1>
        <p class="sous">Elle est peut-être complète, ou la date est passée. Choisissez une autre
        date sur <a href="https://www.mystoryformation.fr/prochaines-sessions-examen">le calendrier
        des sessions</a>, ou appelez-nous au <b>06 81 43 16 54</b> — nous vous trouverons une place.</p>
      </div>`),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const devis = calculerMontant(s.type, s.date_examen, []);
  const estTef = s.type === "TEF_IRN";

  const lignes = devis.detail
    .map((d) => `<div class="ligne"><span>${ech(d.libelle)}</span><b>${euros(d.prix)}</b></div>`)
    .join("");

  const corps = `
<div class="carte">
  <h1>Inscription à l'examen</h1>
  <p class="sous">Renseignez vos informations, puis réglez votre inscription. Vous recevrez votre
  convocation et votre facture par e-mail dès le règlement enregistré.</p>

  <div class="session">
    <div class="t">${estTef ? "TEF IRN" : "Examen civique"} — ${ech(jourLisible(s.date_examen))}</div>
    <div class="d">${ech(s.horaire)} · ${ech(s.centre_nom)} · ${s.places_restantes} place${s.places_restantes > 1 ? "s" : ""} restante${s.places_restantes > 1 ? "s" : ""}</div>
  </div>

  <h2>Montant</h2>
  <div style="margin-top:8px">${lignes}
    <div class="total"><span>Total</span><span id="total">${euros(devis.montant)}</span></div>
  </div>
  ${devis.urgence ? `<div class="urgence"><b>Tarif d'urgence.</b> Cette session a lieu dans moins de
   7 jours : nous rouvrons une liste déjà arrêtée, prévenons la CCI et produisons votre convocation
   dans la journée.</div>` : ""}
</div>

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
  ${estTef ? `
  <label for="sous_type">Motivation de votre examen <span class="obl">*</span></label>
  <select id="sous_type" name="sous_type" required><option value="">—</option>${opts(MOTIVATIONS_CCI)}</select>
  <label for="piece_identite">Numéro de votre pièce d'identité <span class="obl">*</span></label>
  <input id="piece_identite" name="piece_identite" required>` : `
  <label for="sous_type">Mention demandée <span class="obl">*</span></label>
  <select id="sous_type" name="sous_type" required><option value="">—</option>${opts(MENTIONS_CIVIQUE)}</select>
  <label for="piece_identite">Numéro étranger <span class="obl">*</span></label>
  <input id="piece_identite" name="piece_identite" required>`}
  <p class="note">La pièce elle-même n'est pas à téléverser : elle sera vérifiée sur place le jour
  de l'examen. Présentez-vous avec l'original en cours de validité.</p>

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="session_id" value="${ech(s.id)}">

  <button id="b" type="submit">Continuer vers le paiement · ${euros(devis.montant)}</button>
  <p class="note">En validant, vous acceptez que ces informations servent à votre inscription à
  l'examen et soient transmises à la CCI Paris Île-de-France. Conservation 5 ans. Droits d'accès et
  de rectification : contact@mystoryformation.fr.<br>
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
    var r=await fetch('/api/inscription-examen',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j && j.ok && j.paiement){ window.location.href=j.paiement; return; }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Une erreur est survenue. Appelez-nous au 06 81 43 16 54, nous finalisons votre inscription.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au 06 81 43 16 54.');
  }
  b.disabled=false; b.textContent='Continuer vers le paiement';
});
</script>`;

  return new NextResponse(page("Inscription à l'examen", corps), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
