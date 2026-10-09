/**
 * MYSTORY — GET /coordonnees?j=<jeton>  (page PUBLIQUE, lien nominatif)
 *
 * 09/10/2026. La quatrième page, au titre du « et tout ce qui te semble bon » —
 * et la seule des propositions qui remplissait vraiment le critère posé par le
 * dirigeant : **ne la construire que si elle supprime une saisie que l'équipe
 * fait aujourd'hui à la main.**
 *
 * ── CE QU'ELLE SUPPRIME, PRÉCISÉMENT ────────────────────────────────────────
 *
 * L'état civil d'un candidat est recopié à la main sur EDOF, chez la CCI, sur la
 * convention, sur l'attestation et sur le certificat. Il est saisi une première
 * fois d'après un appel téléphonique — donc à l'oreille, donc avec les fautes
 * d'un nom entendu et pas lu.
 *
 * Et c'est là que les dossiers CPF meurent. Pas sur le choix de la formation :
 * sur la vérification d'identité. Un prénom inversé, une ville de naissance
 * approximative, un nom marital là où l'état civil attend un nom de naissance,
 * et l'identification sur moncompteformation.gouv.fr échoue. Le candidat repart
 * pour un rendez-vous et nous avons perdu trois semaines.
 *
 * La seule personne qui sache écrire son nom correctement, c'est lui.
 *
 * ── 🔴 LA PAGE EST PRÉ-REMPLIE, ET L'ACTION NORMALE EST UN SEUL CLIC ────────
 *
 * Règle du chantier, tirée d'une mesure : le relevé du 09/10 montre que les
 * surfaces de saisie libre de ce CRM sont vides (`taches`, `remarques`,
 * `messages_internes`, `reclamations` : 0 ligne). Une page qui demande de taper
 * ne sera pas utilisée — et ici le candidat est sur un téléphone, souvent non
 * francophone.
 *
 * Donc : tout arrive pré-rempli depuis la base, le bouton principal est « tout
 * est exact » (aucune frappe), et les champs ne s'ouvrent QUE si le candidat
 * déclare une erreur. C'est le seul endroit de ce chantier où des champs de
 * saisie sont justifiés : aucune case à cocher ne peut corriger l'orthographe
 * d'un nom.
 *
 * Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { ech } from "@/lib/html";
import { pagePublique, TEL_PUBLIC, COURRIEL_PUBLIC } from "@/lib/pagePublique";
import { ouvrirLien, contexteDossier, jourFr } from "@/lib/liensCandidat";
import { refusLienHtml } from "@/lib/liensCandidatPages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("j") ?? "";
  const lien = await ouvrirLien(jeton, "coordonnees");
  if (!lien) return refusLienHtml("Vos coordonnées");

  const c = await contexteDossier(lien.dossierId);
  if (!c) return refusLienHtml("Vos coordonnées");

  /** Une ligne du récapitulatif en lecture. « Non renseigné » est DIT : une ligne
   *  vide passe pour un oubli d'affichage, et le candidat ne la complète pas. */
  const ligne = (libelle: string, valeur: string | null) => `<div class="ligne">
    <span>${ech(libelle)}</span>
    <b>${valeur ? ech(valeur) : "<span style=\"color:var(--mys-rouge-600)\">à compléter</span>"}</b>
  </div>`;

  const corps = `
<div class="carte">
  <h1>Vérifiez vos informations</h1>
  <p class="sous">Bonjour ${ech(c.prenom)}, voici ce que nous avons noté. Ces informations
  partent sur votre dossier de formation et à la CCI Paris Île-de-France pour votre examen :
  elles doivent correspondre <b>exactement à votre pièce d'identité</b>.</p>
  <p class="sous"><b>Une lettre qui diffère suffit à bloquer un dossier.</b> C'est la première
  cause de retard que nous voyons — une minute de relecture ici vous évite un rendez-vous de
  plus.</p>

  <h2>Votre identité</h2>
  <div style="margin-top:8px">
    ${ligne("Civilité", c.civilite)}
    ${ligne("Nom", c.nom)}
    ${ligne("Prénom", c.prenom)}
    ${ligne("Date de naissance", c.dateNaissance ? jourFr(c.dateNaissance) : null)}
    ${ligne("Ville de naissance", c.villeNaissance)}
    ${ligne("Nationalité", c.nationalite)}
  </div>

  <h2>Vos coordonnées</h2>
  <div style="margin-top:8px">
    ${ligne("Téléphone", c.telephone)}
    ${ligne("E-mail", c.email)}
    ${ligne("Adresse", c.adresse)}
    ${ligne("Code postal et ville", [c.cp, c.ville].filter(Boolean).join(" ") || null)}
  </div>
</div>

<form id="f" class="carte">
  <div id="erreur"></div>
  <h1 class="h1b">Tout est-il exact ?</h1>
  <div class="moyens">
    <label class="moyen">
      <input type="radio" name="verdict" value="exact" checked>
      <span><span class="l">Oui, tout est exact</span>
      <span class="m">Nous n'avons rien à changer. C'est la seule chose à faire — un clic et
      c'est terminé.</span></span>
    </label>
    <label class="moyen">
      <input type="radio" name="verdict" value="corriger">
      <span><span class="l">Non, il y a une erreur à corriger</span>
      <span class="m">Les champs s'ouvrent, déjà remplis : vous ne modifiez que ce qui est
      faux.</span></span>
    </label>
  </div>

  <!-- Les champs sont PRÉ-REMPLIS et masqués par défaut. Le candidat qui n'a rien à
       corriger ne tape jamais rien ; celui qui corrige ne retape pas ce qui est juste. -->
  <div id="champs" style="display:none">
    <h2>Corrigez seulement ce qui est faux</h2>
    <div class="duo">
      <div><label for="civilite">Civilité</label>
        <select id="civilite" name="civilite">
          <option value="">—</option>
          <option${c.civilite === "Madame" ? " selected" : ""}>Madame</option>
          <option${c.civilite === "Monsieur" ? " selected" : ""}>Monsieur</option>
        </select></div>
      <div><label for="nationalite">Nationalité</label>
        <input id="nationalite" name="nationalite" value="${ech(c.nationalite ?? "")}"></div>
    </div>
    <div class="duo">
      <div><label for="nom">NOM (comme sur la pièce d'identité)</label>
        <input id="nom" name="nom" value="${ech(c.nom)}" autocomplete="family-name"></div>
      <div><label for="prenom">Prénom</label>
        <input id="prenom" name="prenom" value="${ech(c.prenom)}" autocomplete="given-name"></div>
    </div>
    <div class="duo">
      <div><label for="date_naissance">Date de naissance</label>
        <input id="date_naissance" name="date_naissance" type="date"
          value="${ech((c.dateNaissance ?? "").slice(0, 10))}"></div>
      <div><label for="ville_naissance">Ville de naissance</label>
        <input id="ville_naissance" name="ville_naissance" value="${ech(c.villeNaissance ?? "")}"></div>
    </div>
    <div class="duo">
      <div><label for="telephone">Téléphone</label>
        <input id="telephone" name="telephone" type="tel" value="${ech(c.telephone ?? "")}"
          autocomplete="tel"></div>
      <div><label for="email">E-mail</label>
        <input id="email" name="email" type="email" value="${ech(c.email)}"
          autocomplete="email"></div>
    </div>
    <label for="adresse">Adresse</label>
    <input id="adresse" name="adresse" value="${ech(c.adresse ?? "")}" autocomplete="street-address">
    <div class="duo">
      <div><label for="cp">Code postal</label>
        <input id="cp" name="cp" value="${ech(c.cp ?? "")}" inputmode="numeric"
          autocomplete="postal-code"></div>
      <div><label for="ville">Ville</label>
        <input id="ville" name="ville" value="${ech(c.ville ?? "")}"
          autocomplete="address-level2"></div>
    </div>
  </div>

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="j" value="${ech(jeton)}">

  <button id="b" type="submit">Valider</button>
  <p class="note">Ces informations servent à votre inscription à l'examen et à votre dossier de
  formation, et sont transmises à la CCI Paris Île-de-France. Conservation 5 ans, jamais
  cédées. Droits d'accès, de rectification et d'effacement :
  <a href="mailto:${ech(COURRIEL_PUBLIC)}">${ech(COURRIEL_PUBLIC)}</a>.</p>
</form>

<div class="carte">
  <h2>Un doute ?</h2>
  <p class="sous" style="margin:0">Appelez-nous au <b>${TEL_PUBLIC}</b>, votre pièce d'identité
  sous les yeux. Nous corrigeons avec vous en deux minutes.</p>
</div>

<script>
var f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('erreur');
var champs=document.getElementById('champs');

/* Les champs n'apparaissent que si le candidat déclare une erreur. Le chemin
   « tout est exact » reste à un seul clic, sans jamais montrer un clavier. */
function majAffichage(){
  var corriger=f.querySelector('input[name=verdict][value=corriger]').checked;
  champs.style.display=corriger?'block':'none';
  b.textContent=corriger?'Enregistrer mes corrections':'Valider : tout est exact';
}
f.querySelectorAll('input[name=verdict]').forEach(function(r){
  r.addEventListener('change',majAffichage);
});
majAffichage();

function afficherErreur(texte){
  e.textContent='';
  var d=document.createElement('div'); d.className='err'; d.textContent=texte;
  e.appendChild(d); window.scrollTo({top:0,behavior:'smooth'});
}
f.addEventListener('submit',async function(ev){
  ev.preventDefault();
  e.textContent='';
  var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
  if(d.verdict==='corriger'){
    if(!d.nom||!d.prenom){ afficherErreur('Le nom et le prénom ne peuvent pas être vides.'); return; }
    if(!d.email){ afficherErreur("L'adresse e-mail ne peut pas être vide : c'est par là que nous vous envoyons vos documents."); return; }
  }
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/coordonnees',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j&&j.ok){
      /* Le message de fin est construit en DOM et jamais par innerHTML : c'est la
         règle de la maison (voir /commande), et elle vaut même ici où le texte est
         une constante — parce que la prochaine version y glissera une valeur venue
         du serveur sans que personne y repense. */
      var fort=document.createElement('b');
      fort.textContent='Merci, c\\'est enregistré.';
      var txt=document.createTextNode(j.corrige
        ? 'Nous avons pris en compte vos corrections. Notre secrétariat vérifie les documents déjà établis.'
        : 'Vos informations sont confirmées. Vous n\\'avez rien d\\'autre à faire.');
      var bloc=document.createElement('div');
      bloc.className='ok';
      bloc.appendChild(fort);
      bloc.appendChild(document.createElement('br'));
      bloc.appendChild(txt);
      f.replaceChildren(bloc);
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au ${TEL_PUBLIC}.');
  }
  b.disabled=false; majAffichage();
});
</script>`;

  return new NextResponse(
    pagePublique({ titre: "Vos coordonnées", corps, atouts: false }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
