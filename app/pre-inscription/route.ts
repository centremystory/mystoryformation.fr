/**
 * MYSTORY — GET /pre-inscription  (page publique, point 14)
 * Formulaire de pré-inscription en ligne pour un prospect. Aucune donnée sensible, aucun secret.
 * La soumission part vers POST /api/pre-inscription (honeypot + rate-limit côté serveur).
 * Public (cf. middleware). Charte MYSTORY (bleu #2F72DE). Lieu de formation : Gagny.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLEU = "#2F72DE";

export async function GET() {
  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Pré-inscription — MYSTORY Formation</title>
<style>
  :root{--bleu:${BLEU};} *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f6fb;color:#1f2430;line-height:1.5;}
  .wrap{max-width:560px;margin:0 auto;padding:20px 14px 60px;}
  .head{background:var(--bleu);color:#fff;border-radius:14px;padding:18px 20px;}
  .head h1{margin:0 0 4px;font-size:19px;} .head .sub{opacity:.92;font-size:13px;}
  .card{background:#fff;border:1px solid #e6e9f0;border-radius:12px;padding:16px;margin-top:14px;}
  label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px;}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid #cfd6e4;border-radius:9px;font-size:15px;background:#fff;font-family:inherit;}
  textarea{min-height:84px;resize:vertical;}
  .row{display:flex;gap:10px;} .row>div{flex:1;}
  .hp{position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden;}
  button{margin-top:18px;width:100%;background:var(--bleu);color:#fff;border:0;border-radius:10px;padding:13px;font-size:16px;font-weight:700;cursor:pointer;}
  button:disabled{opacity:.55;cursor:default;}
  .note{font-size:12px;color:#6b7280;margin-top:10px;}
  .msg{margin-top:14px;padding:12px 14px;border-radius:10px;font-size:14px;display:none;}
  .ok{background:#e8f6ee;color:#15663a;border:1px solid #bfe6cf;}
  .err{background:#fdecec;color:#a12121;border:1px solid #f3c2c2;}
  .done h2{color:var(--bleu);}
</style></head><body>
<div class="wrap">
  <div class="head">
    <h1>Pré-inscription — MYSTORY Formation</h1>
    <div class="sub">Préparez votre certification de français (TEF IRN / LEVELTEL). Sans engagement : nous vous recontactons pour finaliser.</div>
  </div>

  <form id="f" class="card" autocomplete="on">
    <div class="row">
      <div><label for="prenom">Prénom *</label><input id="prenom" name="prenom" required></div>
      <div><label for="nom">Nom *</label><input id="nom" name="nom" required></div>
    </div>
    <label for="email">Email</label><input id="email" name="email" type="email" placeholder="vous@exemple.fr">
    <label for="telephone">Téléphone</label><input id="telephone" name="telephone" type="tel" placeholder="06 …">
    <p class="note">Indiquez au moins un email ou un téléphone pour qu'on puisse vous recontacter.</p>

    <label for="certif">Certification souhaitée</label>
    <select id="certif" name="certif">
      <option value="indecis">Je ne sais pas encore</option>
      <option value="TEF_IRN">TEF IRN (intégration / résidence / nationalité)</option>
      <option value="LEVELTEL">LEVELTEL (français professionnel)</option>
    </select>

    <label for="financement">Financement envisagé</label>
    <select id="financement" name="financement">
      <option value="indecis">À déterminer</option>
      <option value="CPF">CPF (Mon Compte Formation)</option>
      <option value="Perso">Fonds propres</option>
      <option value="OPCO">OPCO (employeur)</option>
      <option value="FranceTravail">France Travail</option>
    </select>

    <label for="niveau">Votre niveau de français actuel (estimation)</label>
    <select id="niveau" name="niveau">
      <option value="indecis">Je ne sais pas</option>
      <option value="debutant">Débutant</option>
      <option value="A1">A1</option><option value="A2">A2</option>
      <option value="B1">B1</option><option value="B2">B2</option>
    </select>

    <label for="message">Disponibilités / message (facultatif)</label>
    <textarea id="message" name="message" placeholder="Ex. disponible les après-midis, objectif naturalisation…"></textarea>

    <div class="hp"><label>Ne pas remplir<input id="website" name="website" tabindex="-1" autocomplete="off"></label></div>

    <button id="b" type="submit">Envoyer ma pré-inscription</button>
    <p class="note">Vos informations servent uniquement à traiter votre demande (RGPD : conservation 5 ans, référent contact@mystoryformation.fr). Le NDA 11756521775 ne vaut pas agrément de l'État.</p>
    <div id="m" class="msg"></div>
  </form>
</div>
<script>
  var f=document.getElementById('f'),b=document.getElementById('b'),m=document.getElementById('m');
  function show(t,cls){m.textContent=t;m.className='msg '+cls;m.style.display='block';}
  f.addEventListener('submit',async function(e){
    e.preventDefault();
    var data={};['prenom','nom','email','telephone','certif','financement','niveau','message','website'].forEach(function(k){data[k]=(document.getElementById(k)||{}).value||'';});
    b.disabled=true;b.textContent='Envoi…';m.style.display='none';
    try{
      var r=await fetch('/api/pre-inscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      var j=await r.json();
      if(j.ok){f.innerHTML='<div class="done"><h2>Merci !</h2><p>Votre pré-inscription est bien reçue. L\\'équipe MYSTORY vous recontacte très vite pour finaliser votre inscription et vos dates.</p><p style="color:#6b7280;font-size:13px">Une question ? contact@mystoryformation.fr · 06 81 43 16 54</p></div>';}
      else{show(j.erreur||'Une erreur est survenue.','err');b.disabled=false;b.textContent='Envoyer ma pré-inscription';}
    }catch(_){show('Connexion impossible. Réessayez.','err');b.disabled=false;b.textContent='Envoyer ma pré-inscription';}
  });
</script>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
