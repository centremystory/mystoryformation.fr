/**
 * MYSTORY — GET /participation?j=<jeton>  (page PUBLIQUE, lien nominatif)
 *
 * 09/10/2026. Demande du dirigeant : « un en attente de 150 euros à payer ».
 *
 * Ces 150 € sont le TICKET MODÉRATEUR : la participation obligatoire du
 * titulaire d'un compte personnel de formation, instaurée en 2024.
 * `TICKET_MODERATEUR` (lib/inscriptions/regles.ts) en est la seule source — le
 * chiffre n'est jamais écrit en dur dans cette page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 NE JAMAIS RÉCLAMER 150 € À QUELQU'UN QUI N'EN DOIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cette page VÉRIFIE EN BASE avant de demander un centime. Quatre états
 * possibles, et un seul affiche un bouton de paiement :
 *
 *   — `due`        CPF, ni réglée ni exonérée → on demande ;
 *   — `reglee`     déjà encaissée → on le confirme, aucun bouton ;
 *   — `exoneree`   exonérée par l'équipe → on le dit, aucun bouton ;
 *   — `sans_objet` pas un dossier CPF → cette participation n'existe pas pour lui.
 *
 * Encaisser 150 € non dus sur un financement public, pendant un contrôle
 * DRIEETS, n'est pas une maladresse : c'est une somme à rendre et une anomalie
 * à expliquer. D'où la vérification, et d'où le chemin de contact offert à qui
 * se croit exonéré — parce que la base peut avoir du retard sur la réalité d'un
 * candidat qui vient de s'inscrire à France Travail.
 *
 * ── LES DEUX VÉRITÉS QUI DOIVENT ÊTRE ÉCRITES ───────────────────────────────
 *
 * Elles sont reprises de `etatParticipation()` dans lib/liensCandidat.ts, et le
 * candidat les ignore presque toujours :
 *
 *   1. la participation est LA MÊME quel que soit le nombre d'heures. 12 h ou
 *      36 h, c'est 150 €. Celui qui a pris le parcours le plus court s'attend à
 *      payer moins et croit à une erreur — il faut le lui écrire, pas seulement
 *      l'appliquer ;
 *   2. elle n'est PAS DUE par les demandeurs d'emploi inscrits à France Travail,
 *      ni lorsqu'un employeur ou un financeur (OPCO, région) prend le relais.
 *
 * Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import {
  ouvrirLien, contexteDossier, etatParticipation, intituleFormation,
  financementLisible, momentFr, euros, TICKET_MODERATEUR,
} from "@/lib/liensCandidat";
import { refusLienHtml } from "@/lib/liensCandidatPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les deux vérités, écrites une fois et réutilisées. */
function lesDeuxVerites(): string {
  return `<h2>Ce qu'il faut savoir sur cette participation</h2>
  <div style="margin-top:8px">
    <div class="ligne"><span><b>Elle est la même pour tous les parcours.</b>
      ${ech(euros(TICKET_MODERATEUR))} que votre formation fasse 12 heures ou 36 heures. Ce n'est
      pas un pourcentage de notre prix, ni un acompte : c'est une participation forfaitaire du
      titulaire du compte, fixée par la réglementation du CPF.</span></div>
    <div class="ligne"><span><b>Elle n'est pas due par tout le monde.</b>
      Si vous êtes <b>inscrit comme demandeur d'emploi à France Travail</b>, ou si votre
      <b>employeur ou un financeur</b> (OPCO, région) prend le relais sur votre dossier, vous
      n'avez rien à régler. Dites-le-nous et nous vérifions.</span></div>
  </div>`;
}

export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("j") ?? "";
  const lien = await ouvrirLien(jeton, "participation");
  if (!lien) return refusLienHtml("Votre participation CPF");

  const c = await contexteDossier(lien.dossierId);
  if (!c) return refusLienHtml("Votre participation CPF");

  const etat = etatParticipation(c);
  const retour = req.nextUrl.searchParams.get("retour");

  /* ── RIEN N'EST DÛ : TROIS ÉCRANS QUI NE DEMANDENT PAS D'ARGENT ───────────
     On ne se contente pas de masquer le bouton : on DIT au candidat pourquoi il
     n'a rien à payer. Un candidat qui reçoit un lien « 150 € à régler » et
     tombe sur une page sans bouton appelle pour savoir s'il doit payer ou non.  */
  if (etat !== "due") {
    const message = etat === "reglee"
      ? `<div class="rond vert">✓</div>
         <h1>C'est réglé, merci</h1>
         <p class="sous">Votre participation de <b>${ech(euros(TICKET_MODERATEUR))}</b> est
         enregistrée. Vous n'avez plus rien à faire sur ce point : votre dossier peut suivre
         son cours.</p>`
      : etat === "exoneree"
      ? `<div class="rond vert">✓</div>
         <h1>Vous n'avez rien à régler</h1>
         <p class="sous">Votre situation vous <b>exonère</b> de la participation de
         ${ech(euros(TICKET_MODERATEUR))} habituellement due au titre du CPF. C'est noté à
         votre dossier — aucun paiement ne vous sera demandé.</p>`
      : `<div class="rond vert">✓</div>
         <h1>Vous n'avez rien à régler</h1>
         <p class="sous">Votre formation n'est pas financée par votre compte personnel de
         formation${c.financement ? ` mais par : <b>${ech(financementLisible(c.financement))}</b>` : ""}.
         La participation forfaitaire de ${ech(euros(TICKET_MODERATEUR))} ne concerne que les
         dossiers CPF : elle ne s'applique donc pas au vôtre.</p>`;

    const corps = `<div class="carte centre">
  ${message}
  <p class="note">Si vous pensez qu'il y a une erreur, appelez-nous au <b>${TEL_PUBLIC}</b> —
  nous reprenons votre dossier avec vous.</p>
</div>
<div class="carte">
  <h2>Votre dossier</h2>
  <div class="ligne"><span>Formation</span><b>${ech(intituleFormation(c))}</b></div>
  <div class="ligne"><span>Financement</span><b>${ech(financementLisible(c.financement))}</b></div>
  ${c.numeroEdof ? `<div class="ligne"><span>N° de dossier</span><b>${ech(c.numeroEdof)}</b></div>` : ""}
</div>`;
    return new NextResponse(
      pagePublique({ titre: "Votre participation CPF", corps, largeur: 620, atouts: false }),
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  /* ── C'EST DÛ ────────────────────────────────────────────────────────────── */

  const demandeFaite = !!c.exonerationDemandeeLe;

  const corps = `
<div class="carte">
  <h1>Il reste ${ech(euros(TICKET_MODERATEUR))} à régler</h1>
  <p class="sous">Bonjour ${ech(c.prenom)}, votre formation est prise en charge par votre compte
  personnel de formation. Il reste une participation de
  <b>${ech(euros(TICKET_MODERATEUR))}</b> à votre charge — c'est la dernière étape avant que
  nous puissions établir votre convention de formation.</p>

  <div class="session">
    <div class="t">${ech(intituleFormation(c))}</div>
    <div class="d">${ech(financementLisible(c.financement))}${
      c.numeroEdof ? ` · dossier n° ${ech(c.numeroEdof)}` : ""}</div>
  </div>

  <h2>Le détail</h2>
  <div style="margin-top:8px">
    <div class="ligne"><span>Montant total de votre formation</span><b>${ech(euros(c.montant))}</b></div>
    <div class="ligne"><span>Pris en charge par votre CPF</span>
      <b>${ech(euros(Math.max(0, c.montant - TICKET_MODERATEUR)))}</b></div>
    <div class="total"><span>À votre charge</span><span>${ech(euros(TICKET_MODERATEUR))}</span></div>
  </div>

  ${lesDeuxVerites()}
</div>

${retour === "attente" ? `<div class="carte">
  <div class="urgence"><b>Votre paiement est en cours de traitement.</b> Nous n'avons pas encore
  reçu la confirmation de notre prestataire bancaire — cela prend parfois quelques minutes.
  Rechargez cette page dans un instant. Si le montant a bien été débité et que rien ne change,
  appelez-nous au <b>${TEL_PUBLIC}</b>, nous vérifions.</div>
</div>` : ""}

<form id="f" class="carte">
  <div id="erreur"></div>
  <h1 class="h1b">Régler ma participation</h1>
  <p class="sous">Paiement sécurisé par carte bancaire. Vos coordonnées bancaires sont saisies
  chez notre prestataire de paiement, jamais chez nous.</p>
  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="j" value="${ech(jeton)}">
  <button id="b" type="submit">Payer ${ech(euros(TICKET_MODERATEUR))}</button>
  <p class="note">Vous recevrez un reçu par e-mail dès le règlement enregistré. Cette
  participation est définitivement acquise une fois la formation commencée ; avant cela, elle
  vous est remboursée si vous renoncez.</p>
</form>

<div class="carte">
  <h1 class="h1b">Je pense ne pas devoir cette participation</h1>
  ${demandeFaite ? `<div class="ok" style="text-align:left">
    <b>Votre demande est enregistrée</b> (le ${ech(momentFr(c.exonerationDemandeeLe))}).
    Notre secrétariat vérifie votre situation et revient vers vous. <b>Ne payez rien en
    attendant.</b>
  </div>` : `
  <p class="sous">Si vous êtes <b>inscrit comme demandeur d'emploi à France Travail</b>, ou si
  votre <b>employeur ou un financeur</b> prend en charge votre dossier, cette participation ne
  vous est pas due. Dites-le-nous : nous vérifions et, le cas échéant, nous l'annulons.
  <b>Ne payez pas « au cas où »</b> — s'il s'avère que vous en êtes exonéré, il faudrait vous
  rembourser.</p>
  <form id="fe">
    <div id="erreure"></div>
    <div class="moyens">
      <label class="moyen">
        <input type="radio" name="motif" value="france_travail" checked>
        <span><span class="l">Je suis inscrit à France Travail</span>
        <span class="m">Demandeur d'emploi inscrit : la participation n'est pas due. Nous vous
        demanderons votre attestation d'inscription.</span></span>
      </label>
      <label class="moyen">
        <input type="radio" name="motif" value="employeur">
        <span><span class="l">Mon employeur ou un financeur prend le relais</span>
        <span class="m">OPCO, employeur, région… Nous vérifions auprès du financeur et vous
        n'avancez rien.</span></span>
      </label>
      <label class="moyen">
        <input type="radio" name="motif" value="autre">
        <span><span class="l">Autre situation — rappelez-moi</span>
        <span class="m">Nous vous appelons au ${ech(c.telephone || TEL_PUBLIC)} pour en parler.</span></span>
      </label>
    </div>
    <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="j" value="${ech(jeton)}">
    <button id="be" type="submit" style="background:var(--mys-marine-700);box-shadow:none">
      Demander la vérification de ma situation</button>
    <p class="note">Cette demande n'annule rien automatiquement : elle est vérifiée par notre
    secrétariat sur justificatif. Nous vous répondons avant toute relance de paiement.</p>
  </form>`}
</div>

<div class="carte">
  <h2>Une question ?</h2>
  <p class="sous" style="margin:0">Appelez-nous au <b>${TEL_PUBLIC}</b> ou écrivez à
  <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>.</p>
</div>

<script>
function erreurDans(cible,texte){
  var e=document.getElementById(cible);
  e.textContent='';
  var d=document.createElement('div'); d.className='err'; d.textContent=texte;
  e.appendChild(d); window.scrollTo({top:0,behavior:'smooth'});
}

var f=document.getElementById('f'),b=document.getElementById('b');
f.addEventListener('submit',async function(ev){
  ev.preventDefault();
  document.getElementById('erreur').textContent='';
  var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/participation/payer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j&&j.ok&&j.paiement){ window.location.href=j.paiement; return; }
    erreurDans('erreur',(j&&typeof j.erreur==='string')?j.erreur:"Le paiement n'a pas pu être ouvert. Appelez-nous au ${TEL_PUBLIC}.");
  }catch(_){
    erreurDans('erreur','Connexion interrompue. Réessayez, ou appelez-nous au ${TEL_PUBLIC}.');
  }
  b.disabled=false; b.textContent='Payer ${ech(euros(TICKET_MODERATEUR))}';
});

var fe=document.getElementById('fe');
if(fe){
  var be=document.getElementById('be');
  fe.addEventListener('submit',async function(ev){
    ev.preventDefault();
    document.getElementById('erreure').textContent='';
    var d={}; new FormData(fe).forEach(function(v,k){ d[k]=String(v).trim(); });
    be.disabled=true; be.textContent='Un instant…';
    try{
      var r=await fetch('/api/participation/exoneration',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
      var j=await r.json();
      if(j&&j.ok){ window.location.reload(); return; }
      erreurDans('erreure',(j&&typeof j.erreur==='string')?j.erreur:"Demande impossible. Appelez-nous au ${TEL_PUBLIC}.");
    }catch(_){
      erreurDans('erreure','Connexion interrompue. Réessayez, ou appelez-nous au ${TEL_PUBLIC}.');
    }
    be.disabled=false; be.textContent='Demander la vérification de ma situation';
  });
}
</script>`;

  return new NextResponse(
    pagePublique({ titre: "Votre participation CPF", corps }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
