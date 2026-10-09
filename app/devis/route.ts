/**
 * MYSTORY — GET /devis?j=<jeton>  (page PUBLIQUE, lien nominatif)
 *
 * 09/10/2026. Demande du dirigeant : « un lien pour dire qu'on a finalisé le
 * devis ».
 *
 * ── CE QUE CETTE PAGE SUPPRIME ──────────────────────────────────────────────
 *
 * Elle est la réponse directe au second relevé du 09/10 : les quatre mêmes
 * informations — **heures · dates des cours · date d'examen · dossier complet ou
 * non** — sont recopiées CINQ fois à la main par l'équipe. Une de ces cinq
 * copies est le devis : aujourd'hui quelqu'un relit le dossier, retape les
 * heures, les dates et le montant dans un message, et l'envoie.
 *
 * Ici, rien n'est retapé. La page LIT le dossier et l'affiche. Le jour où les
 * heures changent après le test de positionnement, le devis change tout seul —
 * alors qu'un message recopié reste faux pour toujours.
 *
 * ── 🔴 POURQUOI ON FIGE UN INSTANTANÉ À L'ACCEPTATION ───────────────────────
 *
 * Un dossier BOUGE : les heures sont arrêtées après le positionnement, le
 * planning se décale, le montant suit. « Le candidat a accepté » ne vaut donc
 * rien si on ne peut plus dire ACCEPTÉ QUOI — et c'est exactement la question
 * que pose un contrôle. `dossiers.devis_accepte_vu` garde ce que le candidat
 * avait sous les yeux à la seconde du clic.
 *
 * Sans cet instantané, la seule réponse possible six mois plus tard serait
 * l'état ACTUEL du dossier, qui n'est précisément pas celui qui a été accepté.
 *
 * ── CE QUE CETTE PAGE NE FAIT PAS ───────────────────────────────────────────
 *
 * Elle n'encaisse rien et ne promet aucune date d'examen. Le paiement de la
 * participation forfaitaire a sa propre page (/participation), et une date
 * d'examen se réserve sur une session réelle — l'annoncer ici, sur un devis,
 * serait promettre une place qui n'est pas tenue.
 *
 * Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import {
  ouvrirLien, contexteDossier, intituleFormation, financementLisible,
  lieuCours, periodeCours, jourCourtFr, creneauLisible, momentFr, euros,
  etatParticipation, TICKET_MODERATEUR,
} from "@/lib/liensCandidat";
import { refusLienHtml } from "@/lib/liensCandidatPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lien = await ouvrirLien(req.nextUrl.searchParams.get("j"), "devis");
  if (!lien) return refusLienHtml("Votre devis");

  const c = await contexteDossier(lien.dossierId);
  if (!c) return refusLienHtml("Votre devis");

  const lieu = lieuCours(c);
  const periode = periodeCours(c);
  const dejaAccepte = !!c.devisAccepteLe;
  const part = etatParticipation(c);

  /* Les séances, une par ligne, dans l'ordre. Le candidat veut savoir quels
     jours il doit être là — c'est l'information qu'il redemande le plus au
     téléphone, et la seule que l'équipe recopie à la main cinq fois. */
  const seances = c.seances.length ? `
  <h2>Vos dates de cours</h2>
  <div style="margin-top:8px">${c.seances.map((s) => `
    <div class="mat">
      <span>${ech(jourCourtFr(s.date))}${
        creneauLisible(s.demiJournee) ? ` <small style="color:var(--mys-gris-600)">· ${ech(creneauLisible(s.demiJournee))}</small>` : ""}</span>
      <span class="r">${ech(s.heures)} h</span>
    </div>`).join("")}</div>` : `
  <h2>Vos dates de cours</h2>
  <p class="sous">Elles ne sont pas encore arrêtées : nous les fixons ensemble avec votre
  formatrice, en fonction de vos disponibilités, dès que votre dossier est complet.</p>`;

  const corps = `
<div class="carte">
  <h1>Votre devis est finalisé</h1>
  <p class="sous">Bonjour ${ech(c.prenom)}, voici votre parcours tel qu'il est arrêté.
  Relisez-le : s'il correspond à ce dont nous avons parlé, vous pouvez l'accepter en bas de
  cette page. Sinon, appelez-nous — rien n'est engagé avant votre accord.</p>

  <div class="session">
    <div class="t">${ech(intituleFormation(c))}</div>
    <div class="d">${ech(financementLisible(c.financement))}${
      c.numeroEdof ? ` · dossier n° ${ech(c.numeroEdof)}` : ""}</div>
    ${lieu ? `<span class="ou">${ech(lieu.nom)} — ${ech(lieu.adresse)}</span>` : ""}
  </div>

  <h2>Le détail</h2>
  <div style="margin-top:8px">
    <div class="ligne"><span>Formation</span><b>${ech(intituleFormation(c))}</b></div>
    <div class="ligne"><span>Volume horaire</span><b>${ech(c.heuresPrevues)} h</b></div>
    ${periode ? `<div class="ligne"><span>Période</span><b>${ech(periode)}</b></div>` : ""}
    ${lieu ? `<div class="ligne"><span>Lieu des cours</span><b>${ech(lieu.nom)}</b>
      <small>${ech(lieu.adresse)}</small></div>` : ""}
    <div class="ligne"><span>Financement</span><b>${ech(financementLisible(c.financement))}</b></div>
    <div class="ligne"><span>Passage du TEF IRN</span><b>compris</b>
      <small>L'examen se déroule à notre centre de Rosny-sous-Bois, 46 bis rue d'Estienne d'Orves.</small></div>
    <div class="total"><span>Montant total</span><span>${ech(euros(c.montant))}</span></div>
  </div>

  ${part === "due" ? `<div class="urgence">
    <b>Dont ${ech(euros(TICKET_MODERATEUR))} à votre charge.</b> Le reste est pris en charge par
    votre compte personnel de formation. Cette participation de ${ech(euros(TICKET_MODERATEUR))}
    est <b>la même quel que soit le nombre d'heures</b> de votre parcours : c'est une
    participation obligatoire du titulaire du compte, pas un acompte sur notre prix.
    Nous vous enverrons un lien de paiement dédié.
  </div>` : ""}
  ${part === "exoneree" ? `<div class="ok" style="text-align:left">
    <b>Vous n'avez rien à régler.</b> La participation de ${ech(euros(TICKET_MODERATEUR))}
    habituellement due au titre du CPF ne vous est pas réclamée : votre situation vous en
    exonère.
  </div>` : ""}

  ${seances}

  <h2>Ce qui est compris</h2>
  <p class="sous" style="margin-bottom:0">Les cours en présentiel dans nos locaux, le livret
  pédagogique et les cahiers d'entraînement, un test de positionnement en début de parcours,
  le passage du TEF IRN à notre centre d'examen de Rosny-sous-Bois, et votre attestation de
  fin de formation.</p>
  <p class="note">MYSTORY ne dispense pas de formation civique : le contrat d'intégration
  républicaine relève exclusivement de l'OFII.</p>
</div>

${dejaAccepte ? `
<div class="carte centre">
  <div class="rond vert">✓</div>
  <h1 class="h1b">Devis accepté</h1>
  <p class="sous">Vous avez accepté ce devis le <b>${ech(momentFr(c.devisAccepteLe))}</b>.
  Nous avons tout ce qu'il faut pour avancer — notre secrétariat enchaîne sur votre convention
  de formation.</p>
  <p class="note">Une erreur, ou vous souhaitez revenir dessus ? Appelez-nous au
  <b>${TEL_PUBLIC}</b>. Un devis accepté n'est pas une formation commencée : vous gardez vos
  droits de rétractation.</p>
</div>` : `
<form id="f" class="carte">
  <div id="erreur"></div>
  <h1 class="h1b">Votre accord</h1>
  <p class="sous">En acceptant, vous confirmez que ce parcours, son volume horaire et son
  montant correspondent à ce qui a été convenu. Votre acceptation est horodatée et nous
  conservons une copie exacte de ce que vous voyez ci-dessus.</p>

  <label class="moyen">
    <input type="checkbox" name="accepte" value="oui">
    <span><span class="l">J'accepte ce devis</span>
    <span class="m">J'ai lu le détail ci-dessus — ${ech(c.heuresPrevues)} h pour
    ${ech(euros(c.montant))}, financé par ${ech(financementLisible(c.financement))} — et je
    confirme mon accord.</span></span>
  </label>

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="j" value="${ech(req.nextUrl.searchParams.get("j") ?? "")}">

  <button id="b" type="submit">Accepter mon devis</button>
  <p class="note">Vous disposez d'un délai de rétractation de 14 jours à compter de votre
  acceptation (art. L. 221-18 du code de la consommation), sauf si vous demandez à commencer
  avant. Conditions générales de vente :
  <a href="https://www.mystoryformation.fr/conditions-generales-de-vente">les consulter</a>.
  Vos données servent uniquement à la gestion de votre dossier, sont conservées 5 ans et ne
  sont jamais cédées. Droits d'accès et de rectification : ${ech(COURRIEL_PUBLIC)}.</p>
</form>

<script>
var f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('erreur');
function afficherErreur(texte){
  e.textContent='';
  var d=document.createElement('div'); d.className='err'; d.textContent=texte;
  e.appendChild(d); window.scrollTo({top:0,behavior:'smooth'});
}
f.addEventListener('submit',async function(ev){
  ev.preventDefault();
  e.textContent='';
  var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
  if(d.accepte!=='oui'){ afficherErreur('Cochez la case pour confirmer votre accord.'); return; }
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/devis/accepter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j&&j.ok){ window.location.reload(); return; }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au ${TEL_PUBLIC}.');
  }
  b.disabled=false; b.textContent='Accepter mon devis';
});
</script>`}

<div class="carte">
  <h2>Une question avant d'accepter ?</h2>
  <p class="sous" style="margin:0">Appelez-nous au <b>${TEL_PUBLIC}</b> ou écrivez à
  <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>. Nous préférons
  répondre à dix questions avant qu'après.</p>
</div>`;

  return new NextResponse(
    pagePublique({ titre: "Votre devis", corps }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
