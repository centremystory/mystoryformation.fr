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
import { pagePublique, adresseCentre } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 09/10/2026 — l'échappement vit désormais dans lib/html.ts : il était en double
// dans ce dépôt, et deux copies finissent par diverger. Comportement identique.

// 09/10/2026 — l'habillage (couleurs, polices, enveloppe, mentions légales) vit
// désormais dans lib/pagePublique.ts, partagé avec les autres pages publiques. Le
// bleu #2F72DE qui était codé ici n'existait nulle part sur mystoryformation.fr.

function opts(liste: readonly string[]) {
  return liste.map((o) => `<option value="${ech(o)}">${ech(o)}</option>`).join("");
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("session") ?? "";
  const s = await lireSession(id);

  if (!s) {
    return new NextResponse(
      pagePublique({ titre: "Session indisponible", largeur: 620, corps: `<div class="carte">
        <h1>Cette session n'est plus disponible</h1>
        <p class="sous">Elle est peut-être complète, ou la date est passée. Choisissez une autre
        date sur <a href="https://www.mystoryformation.fr/prochaines-sessions-examen">le calendrier
        des sessions</a>, ou appelez-nous au <b>06 81 43 16 54</b> — nous vous trouverons une place.</p>
      </div>` }),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const devis = calculerMontant(s.type, s.date_examen);
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
    <div class="d">${ech(s.horaire)} · ${ech(s.centre_nom)} · ${s.places_restantes} place${s.places_restantes > 1 ? "s" : ""} restante${s.places_restantes > 1 ? "s" : ""}
      ${adresseCentre(s.centre_nom) ? `<span class="ou">${ech(adresseCentre(s.centre_nom))}</span>` : ""}
    </div>
  </div>

  <h2>Montant</h2>
  <div style="margin-top:8px">${lignes}
    <div class="total"><span>Total</span><span id="total">${euros(devis.montant)}</span></div>
  </div>
  ${devis.urgence ? `<div class="urgence"><b>Tarif d'urgence.</b> Cette session a lieu dans moins de
   7 jours : nous rouvrons une liste déjà arrêtée, prévenons la CCI et produisons votre convocation
   dans la journée.</div>` : ""}
  <p class="note"><b>Paiement sécurisé par carte bancaire.</b> Vos coordonnées bancaires sont saisies
  chez notre prestataire de paiement, jamais chez nous. Dès le règlement enregistré, votre convocation
  et votre facture partent automatiquement par e-mail.</p>
</div>

<form id="f" class="carte" novalidate>
  <div id="erreur"></div>
  <h1 class="h1b">Vos informations</h1>
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
  de rectification : contact@mystoryformation.fr.</p>
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

  return new NextResponse(pagePublique({ titre: "Inscription à l'examen", corps }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
