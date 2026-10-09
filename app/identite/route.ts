/**
 * MYSTORY — GET /identite?j=<jeton>  (page PUBLIQUE, lien nominatif)
 *
 * 09/10/2026. Demande du dirigeant : « je veux un formulaire quand on fait le
 * courrier de vérification d'identité en ligne ou par courrier ou les 2 ».
 *
 * ── CE QUE CETTE PAGE SUPPRIME ──────────────────────────────────────────────
 *
 * Aujourd'hui la voie se décide au téléphone. Quelqu'un appelle le candidat,
 * lui explique les deux options, note la réponse dans la case « Note de suivi »
 * de /identites — et la note est du texte libre, donc elle est rédigée
 * différemment par chacun, donc elle n'est pas exploitable. Le relevé du 09/10
 * est sans appel sur ce point : les surfaces de texte libre de ce CRM sont
 * vides ou illisibles.
 *
 * Ici le candidat décide lui-même, en un clic, et la réponse arrive dans une
 * COLONNE — `stagiaires.verification_identite_voie` — avec trois valeurs
 * possibles et pas trente formulations.
 *
 * ── 🔴 CETTE PAGE NE VALIDE AUCUNE IDENTITÉ ─────────────────────────────────
 *
 * Elle écrit la VOIE (`verification_identite_voie`), jamais le STATUT
 * (`verification_identite`). La distinction est écrite au long dans la
 * migration 84 et elle est le cœur du sujet : le statut est une CONSTATATION —
 * quelqu'un chez nous a vu la pièce — et une page ouverte par un lien reçu par
 * e-mail ne constate rien. La laisser écrire le statut, ce serait laisser un
 * candidat valider sa propre identité en cochant une case, soit exactement ce
 * que la vérification cherche à empêcher.
 *
 * Déclarée publique dans middleware.ts. Aucun secret, aucune donnée d'un autre
 * candidat : la page ne lit que le dossier que son jeton désigne.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import { ouvrirLien, contexteDossier } from "@/lib/liensCandidat";
import { refusLienHtml } from "@/lib/liensCandidatPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les trois voies, et ce qu'elles IMPLIQUENT concrètement.
 *
 * Le dirigeant a demandé « en une phrase ce que chaque option implique ». Les
 * délais annoncés sont des ordres de grandeur honnêtes, pas des engagements :
 * d'où « comptez » et jamais « sous 48 h garanties ». Et aucune fausse urgence
 * — l'entreprise est en cours de contrôle DRIEETS, et l'art. L. 121-2 du code
 * de la consommation sanctionne la pratique commerciale trompeuse.
 *
 * ⚠️ « les deux » n'est pas une option de confort ajoutée pour faire trois
 * choix : c'est la plus sûre, et elle est RECOMMANDÉE. Un dossier CPF ne meurt
 * presque jamais sur le choix de la formation, il meurt sur la vérification
 * d'identité — et mener les deux voies en parallèle est ce qui évite de
 * repartir de zéro quand la première échoue.
 */
const VOIES = [
  {
    code: "en_ligne",
    titre: "En ligne, depuis mon téléphone",
    detail: "Vous vous identifiez sur moncompteformation.gouv.fr avec France Identité ou "
      + "l'Identité Numérique La Poste. C'est la voie la plus rapide : une dizaine de minutes, "
      + "et rien à nous renvoyer. Il faut une pièce d'identité en cours de validité et un "
      + "téléphone qui lit les puces sans contact.",
  },
  {
    code: "courrier",
    titre: "Par courrier",
    detail: "Nous vous envoyons le formulaire à votre adresse ; vous nous le retournez signé "
      + "avec la copie de votre pièce d'identité. Aucune démarche en ligne à faire. "
      + "Comptez une dizaine de jours entre l'envoi et la validation.",
  },
  {
    code: "les_deux",
    titre: "Les deux, par sécurité",
    recommande: true,
    detail: "Vous tentez en ligne, et le courrier part quand même en parallèle. Si "
      + "l'identification en ligne échoue — cela arrive, selon la pièce et le téléphone — le "
      + "courrier a déjà pris de l'avance et vous ne repartez pas de zéro. C'est ce que nous "
      + "conseillons.",
  },
] as const;

export async function GET(req: NextRequest) {
  const lien = await ouvrirLien(req.nextUrl.searchParams.get("j"), "identite");
  if (!lien) return refusLienHtml("Vérification d'identité");

  const c = await contexteDossier(lien.dossierId);
  if (!c) return refusLienHtml("Vérification d'identité");

  /* Idempotence : le candidat rouvre son lien pour vérifier que c'est bien passé.
     Sans cette branche il verrait le formulaire vide et croirait son choix perdu —
     puis il appellerait, ce qui est précisément ce qu'on cherche à éviter. */
  const dejaFait = !!c.verificationIdentiteVoie;
  const voieFaite = VOIES.find((v) => v.code === c.verificationIdentiteVoie);

  /* L'adresse postale, MONTRÉE et jamais demandée. Elle est en base ; la
     retaper sur un téléphone produirait surtout des fautes de frappe. Le
     candidat la relit, et s'il la conteste il le dit d'une CASE À COCHER —
     aucun champ de saisie sur cette page, c'est la règle du chantier. */
  const adresse = [c.adresse, [c.cp, c.ville].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");

  const corps = `
<div class="carte">
  <h1>Votre vérification d'identité</h1>
  <p class="sous">Bonjour ${ech(c.prenom)}, il reste une étape pour débloquer votre dossier :
  vérifier votre identité auprès de la Caisse des dépôts. C'est elle qui gère votre compte
  formation, et sans cette vérification votre dossier reste en attente.
  <b>Vous choisissez comment vous voulez la faire</b> — c'est la seule question de cette page.</p>

  ${dejaFait ? `<div class="ok" style="text-align:left">
    <b>C'est enregistré.</b> Vous avez choisi : <b>${ech(voieFaite?.titre ?? c.verificationIdentiteVoie)}</b>.
    ${c.verificationIdentiteVoie === "en_ligne" || c.verificationIdentiteVoie === "les_deux"
      ? "Rendez-vous sur moncompteformation.gouv.fr pour l'identification en ligne."
      : "Vous recevrez le courrier à votre adresse."}
    <br><br>Notre secrétariat a été prévenu et revient vers vous. Pour changer d'avis,
    appelez-nous au <b>${TEL_PUBLIC}</b>.
  </div>` : ""}
</div>

${dejaFait ? "" : `
<form id="f" class="carte">
  <div id="erreur"></div>
  <h1 class="h1b">Comment souhaitez-vous procéder ?</h1>
  <div class="moyens">
    ${VOIES.map((v, i) => `
    <label class="moyen">
      <input type="radio" name="voie" value="${ech(v.code)}"${i === 2 ? " checked" : ""}>
      <span><span class="l">${ech(v.titre)}${
        (v as { recommande?: boolean }).recommande ? " · conseillé" : ""}</span>
      <span class="m">${ech(v.detail)}</span></span>
    </label>`).join("")}
  </div>

  ${adresse ? `<h2>L'adresse où nous enverrions le courrier</h2>
  <div class="session">
    <div class="t">${ech(`${c.prenom} ${c.nom}`)}</div>
    <div class="d">${ech(adresse)}</div>
  </div>
  <label class="moyen" style="margin-top:10px">
    <input type="checkbox" name="adresse_a_corriger" value="oui">
    <span><span class="l">Cette adresse n'est plus la bonne</span>
    <span class="m">Cochez et nous vous rappellerons pour la corriger avant d'envoyer quoi que
    ce soit. Un courrier parti à une ancienne adresse, c'est dix jours perdus.</span></span>
  </label>` : `<div class="urgence"><b>Nous n'avons pas votre adresse postale.</b>
   Si vous choisissez le courrier, notre secrétariat vous appellera pour la noter avant
   l'envoi.</div>`}

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="j" value="${ech(req.nextUrl.searchParams.get("j") ?? "")}">

  <button id="b" type="submit">Enregistrer mon choix</button>
  <p class="note">Votre choix est transmis à notre secrétariat, qui lance la démarche et vous
  recontacte. Ces informations servent uniquement à la gestion de votre dossier de formation,
  sont conservées 5 ans et ne sont jamais cédées. Droits d'accès et de rectification :
  ${ech(COURRIEL_PUBLIC)}.</p>
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
  if(!d.voie){ afficherErreur('Choisissez une des trois options.'); return; }
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/identite/voie',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j&&j.ok){ window.location.reload(); return; }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au ${TEL_PUBLIC}.');
  }
  b.disabled=false; b.textContent='Enregistrer mon choix';
});
</script>`}

<div class="carte">
  <h2>Une question ?</h2>
  <p class="sous" style="margin:0">Appelez-nous au <b>${TEL_PUBLIC}</b> ou écrivez à
  <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>. Nous faisons cette
  démarche tous les jours — elle est plus simple qu'elle n'en a l'air.</p>
</div>`;

  return new NextResponse(
    pagePublique({ titre: "Votre vérification d'identité", corps, atouts: false }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
