/**
 * MYSTORY — GET /satisfaction?token=<dossiers.token>&type=chaud|froid
 * Formulaire de satisfaction rempli EN LIGNE par le stagiaire (téléphone ou ordinateur).
 * Accès : capability par jeton non devinable, comme /suivi — public (cf. middleware), aucun secret.
 * La soumission part vers POST /api/satisfaction qui valide le jeton côté serveur,
 * enregistre la réponse (immuable), archive le PDF et passe la pièce en « faite ».
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLEU = "#2F72DE";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function page(titre: string, corps: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(titre)}</title>
<style>
  :root{--bleu:${BLEU};} *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f6fb;color:#1f2430;line-height:1.5;}
  .wrap{max-width:560px;margin:0 auto;padding:20px 14px 60px;}
  .head{background:var(--bleu);color:#fff;border-radius:14px;padding:18px 20px;}
  .head h1{margin:0 0 4px;font-size:18px;} .head .sub{opacity:.92;font-size:13px;}
  .card{background:#fff;border:1px solid #e6e9f0;border-radius:12px;padding:16px;margin-top:14px;}
  .q{font-weight:600;font-size:14px;margin:0 0 8px;}
  .scale{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
  .scale label{flex:1;min-width:36px;text-align:center;border:1px solid #d8e0ec;border-radius:8px;padding:8px 0;font-size:14px;cursor:pointer;background:#fbfcfe;}
  .scale input{display:none;}
  .scale input:checked+span{display:block;background:var(--bleu);color:#fff;border-radius:7px;margin:-8px 0;padding:8px 0;}
  .labs{display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:2px;}
  .opts label{display:block;border:1px solid #d8e0ec;border-radius:8px;padding:10px 12px;margin:6px 0;font-size:14px;cursor:pointer;background:#fbfcfe;}
  .opts input{margin-right:8px;}
  textarea{width:100%;border:1px solid #d8e0ec;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;min-height:80px;}
  button{width:100%;background:var(--bleu);color:#fff;border:0;border-radius:10px;padding:14px;font-size:16px;font-weight:600;cursor:pointer;margin-top:16px;}
  button:disabled{opacity:.5;}
  .err{background:#FCEBEB;color:#791F1F;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:12px;display:none;}
  .ok{background:#EAF3DE;color:#27500A;border-radius:12px;padding:24px 16px;font-size:15px;text-align:center;margin-top:14px;}
  .foot{margin-top:24px;color:#9aa1ad;font-size:11px;text-align:center;}
</style></head><body><div class="wrap">${corps}
<div class="foot">MYSTORY — SASU · NDA 11756521775 (ne vaut pas agrément de l'État) · contact@mystoryformation.fr<br>
Données traitées pour le suivi de la formation (RGPD, conservation 5 ans) — droits : contact@mystoryformation.fr · CNIL (www.cnil.fr) · <a href="/politique-confidentialite" target="_blank" style="color:inherit;">politique de confidentialité</a></div>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function echelle(name: string, min: number, max: number, labGauche: string, labDroite: string): string {
  const cases = Array.from({ length: max - min + 1 }, (_, i) => {
    const v = min + i;
    return `<label><input type="radio" name="${name}" value="${v}" required><span>${v}</span></label>`;
  }).join("");
  return `<div class="labs"><span>${labGauche}</span><span>${labDroite}</span></div><div class="scale">${cases}</div>`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  const type = req.nextUrl.searchParams.get("type")?.trim();
  if (!token || (type !== "chaud" && type !== "froid")) {
    return page("Lien invalide", `<div class="card">Lien incomplet ou invalide. Contactez MYSTORY : contact@mystoryformation.fr</div>`);
  }

  const { data: dossier } = await supabaseAdmin
    .from("dossiers")
    .select("id, certif, date_debut, date_fin, stagiaires ( prenom, nom )")
    .eq("token", token)
    .maybeSingle();
  if (!dossier) {
    return page("Lien invalide", `<div class="card">Ce lien ne correspond à aucun dossier. Contactez MYSTORY : contact@mystoryformation.fr</div>`);
  }

  const { data: deja } = await supabaseAdmin
    .from("satisfactions").select("horodatage")
    .eq("dossier_id", (dossier as any).id).eq("type", type).maybeSingle();

  const s = (dossier as any).stagiaires;
  const prenom = esc(s?.prenom ?? "");
  const titre = type === "chaud" ? "Questionnaire de satisfaction" : "Questionnaire de satisfaction à froid";

  if (deja) {
    return page(titre, `
<div class="head"><h1>${esc(titre)}</h1><div class="sub">MYSTORY Formation</div></div>
<div class="ok">✅ Merci ${prenom} ! Votre réponse a déjà été enregistrée.<br>Elle ne peut être remplie qu'une seule fois.</div>`);
  }

  const questionsChaud = `
<div class="card"><p class="q">Recommanderiez-vous cette formation à un proche ?</p>${echelle("nps", 0, 10, "Non", "Oui")}</div>
<div class="card"><p class="q">Information reçue avant la formation (programme, objectifs, organisation)</p>${echelle("q_info", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Conditions matérielles et accueil (salle, matériel, accès)</p>${echelle("q_conditions", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Qualité pédagogique et adaptation du formateur à mes besoins</p>${echelle("q_pedago", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Rythme et progression de la formation</p>${echelle("q_rythme", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">La formation répond à mon projet et à mes attentes</p>${echelle("q_projet", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Points forts / axes d'amélioration (facultatif)</p><textarea name="commentaire" maxlength="2000"></textarea></div>`;

  const questionsFroid = `
<div class="card"><p class="q">Avez-vous passé l'examen ?</p><div class="opts">
  <label><input type="radio" name="examen" value="oui" required>Oui</label>
  <label><input type="radio" name="examen" value="prevu">Non, prévu</label>
  <label><input type="radio" name="examen" value="pas_encore">Pas encore</label></div></div>
<div class="card"><p class="q">Niveau obtenu</p><div class="opts">
  <label><input type="radio" name="niveau_obtenu" value="A2" required>A2</label>
  <label><input type="radio" name="niveau_obtenu" value="B1">B1</label>
  <label><input type="radio" name="niveau_obtenu" value="B2">B2</label>
  <label><input type="radio" name="niveau_obtenu" value="attente">En attente du résultat / non passé</label></div></div>
<div class="card"><p class="q">Votre démarche a-t-elle abouti (titre de séjour / résident / naturalisation) ?</p><div class="opts">
  <label><input type="radio" name="demarche" value="oui" required>Oui</label>
  <label><input type="radio" name="demarche" value="en_cours">En cours</label>
  <label><input type="radio" name="demarche" value="non">Non</label></div></div>
<div class="card"><p class="q">La formation m'a aidé(e) à atteindre mon objectif</p>${echelle("q_objectif", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">J'utilise le français appris dans ma vie professionnelle et quotidienne</p>${echelle("q_usage", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Avec le recul, la formation correspondait à mes besoins</p>${echelle("q_besoins", 1, 5, "Pas du tout", "Tout à fait")}</div>
<div class="card"><p class="q">Recommanderiez-vous cette formation à un proche ?</p>${echelle("nps", 0, 10, "Non", "Oui")}</div>
<div class="card"><p class="q">Commentaires — impact, suggestions (facultatif)</p><textarea name="commentaire" maxlength="2000"></textarea></div>`;

  const corps = `
<div class="head"><h1>${esc(titre)}</h1>
<div class="sub">Bonjour ${prenom} 👋 Votre avis compte — 2 minutes, depuis votre téléphone.</div></div>
<form id="f">
${type === "chaud" ? questionsChaud : questionsFroid}
<div class="err" id="err"></div>
<button type="submit" id="btn">Envoyer ma réponse</button>
</form>
<script>
document.getElementById('f').addEventListener('submit', async function(e){
  e.preventDefault();
  var btn = document.getElementById('btn'); btn.disabled = true; btn.textContent = 'Envoi…';
  var err = document.getElementById('err'); err.style.display = 'none';
  var fd = new FormData(this); var reponses = {};
  fd.forEach(function(v, k){ reponses[k] = v; });
  try {
    var r = await fetch('/api/satisfaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(token)}, type: ${JSON.stringify(type)}, reponses: reponses })
    });
    var j = await r.json();
    if (!j.ok) throw new Error(j.erreur || 'Erreur lors de l\\'envoi.');
    document.querySelector('.wrap').innerHTML = '<div class="head"><h1>Merci ${prenom} ! 🙏</h1><div class="sub">MYSTORY Formation</div></div><div class="ok">Votre réponse a bien été enregistrée.<br>Toute l\\'équipe MYSTORY vous remercie et vous souhaite une belle réussite !</div>';
    window.scrollTo(0, 0);
  } catch (ex) {
    err.textContent = ex.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Envoyer ma réponse';
  }
});
</script>`;
  return page(titre, corps);
}
