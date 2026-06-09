/**
 * MYSTORY — GET /fiche-besoin?token=...   (Fiche d'analyse du besoin pré-remplie)
 * ------------------------------------------------------------------------------
 * Page A4 calquée sur le modèle v3. Pré-remplit uniquement les éléments objectifs
 * issus du positionnement : Bénéficiaire, Contact, Niveau estimé (= niveau global),
 * Niveau visé. Le reste (objectif professionnel, projet, compensation, cohérence,
 * date, signatures) est laissé À LA MAIN (jugement humain / conformité).
 * Public (non couvert par le middleware). Aucun secret ici.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FN = "https://svepgknbbonrtwyvzaar.supabase.co/functions/v1/positionnement";
const EST = ["A0", "A1", "A2", "B1", "B2"];

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function buildFicheHtml(p: Record<string, any>): string {
  const beneficiaire = `${esc(p.prenom || "")} ${esc(p.nom || "")}`.trim();
  const contact = [esc(p.telephone || ""), esc(p.email || "")].filter(Boolean).join(" · ");
  const est = p.niveau_global || "";
  const vise = p.niveau_vise || "";
  const estBox = (v: string) => `<span class="box${est === v ? " on" : ""}">${est === v ? "✔" : ""}</span> ${v}`;
  const viseBox = (v: string) => `<span class="box${vise === v ? " on" : ""}">${vise === v ? "✔" : ""}</span> ${v}`;
  const viseAutre = vise && !["A2", "B1", "B2"].includes(vise) ? ` &nbsp;(visé : <b>${esc(vise)}</b>)` : "";
  const off = `<span class="box"></span>`;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MYSTORY — Fiche d'analyse du besoin${beneficiaire ? " — " + beneficiaire : ""}</title>
<style>
:root{--blue:#2F72DE;--navy:#1A4488;--grey:#5A6472;--lite:#EAF1FC;--bord:#C9D7EF;--ink:#23303f;}
*{box-sizing:border-box;}
body{font-family:'Segoe UI',Calibri,Arial,sans-serif;color:var(--ink);margin:0;background:#F4F7FC;line-height:1.5;}
.sheet{max-width:800px;margin:0 auto;background:#fff;padding:26px 34px 30px;}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--blue);padding-bottom:10px;}
.brand{font-size:24px;font-weight:800;color:var(--blue);letter-spacing:1px;}
.legal{font-size:9.5px;color:var(--grey);max-width:430px;text-align:right;}
h1{color:var(--blue);font-size:19px;margin:18px 0 2px;}
.subtitle{color:var(--grey);margin:0 0 14px;font-size:13px;}
.infos{width:100%;border-collapse:collapse;margin:6px 0 14px;}
.infos td{padding:7px 9px;border:1px solid var(--bord);font-size:13.5px;}
.infos td.k{background:var(--lite);color:var(--navy);font-weight:600;width:38%;}
.section-t{color:var(--navy);font-weight:700;font-size:14px;margin:16px 0 6px;border-bottom:1px solid var(--bord);padding-bottom:3px;}
.q{font-size:13.5px;margin:9px 0 3px;font-weight:600;color:var(--ink);}
.opts{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:13.5px;margin:5px 0;}
.box{display:inline-block;width:16px;height:16px;border:1.5px solid var(--navy);border-radius:3px;text-align:center;line-height:14px;font-size:12px;color:#fff;vertical-align:-3px;}
.box.on{background:var(--blue);border-color:var(--blue);}
.fill{border:1px solid var(--bord);border-radius:8px;min-height:30px;padding:8px 10px;font-size:13.5px;background:#FBFCFE;}
.fill.hand{background:repeating-linear-gradient(transparent,transparent 27px,#E6EDF8 28px);min-height:58px;}
.note{background:var(--lite);border-left:4px solid var(--blue);padding:8px 12px;border-radius:8px;color:var(--navy);font-size:12px;margin:8px 0;}
.sign{display:flex;justify-content:space-between;gap:20px;margin-top:18px;font-size:13.5px;}
.sign .sigbox{flex:1;border:1px solid var(--bord);border-radius:8px;min-height:80px;padding:6px 9px;}
.rgpd{font-size:9.5px;color:var(--grey);margin-top:16px;border-top:1px solid var(--bord);padding-top:8px;}
.ftr{font-size:9.5px;color:var(--grey);text-align:center;margin-top:6px;}
.btnbar{text-align:center;margin:14px 0;}
.btn{background:var(--blue);color:#fff;border:none;border-radius:9px;padding:11px 22px;font-size:15px;font-weight:700;cursor:pointer;}
@media print{body{background:#fff;}.sheet{padding:0;}.btnbar{display:none!important;}}
</style></head>
<body>
<div class="btnbar"><button class="btn" onclick="window.print()">📋 Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
  <div class="top">
    <div class="brand">MYSTORY</div>
    <div class="legal">SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017 · Déclaration d'activité 11756521775 (ne vaut pas agrément de l'État) · contact@mystoryformation.fr</div>
  </div>

  <h1>FICHE D'ANALYSE DU BESOIN</h1>
  <p class="subtitle">Analyse du besoin du bénéficiaire</p>

  <table class="infos">
    <tr><td class="k">Bénéficiaire</td><td>${beneficiaire || "&nbsp;"}</td></tr>
    <tr><td class="k">Contact</td><td>${contact || "&nbsp;"}</td></tr>
    <tr><td class="k">Date</td><td>____ / ____ / ________</td></tr>
  </table>

  <div class="section-t">Objectif professionnel</div>
  <div class="q">Objectif principal (nécessairement professionnel) :</div>
  <div class="opts">
    <span>${off} Accès / retour à l'emploi</span>
    <span>${off} Maintien dans l'emploi / adaptation au poste</span>
    <span>${off} Mobilité / évolution professionnelle</span>
  </div>
  <div class="q">Description du projet professionnel (obligatoire) :</div>
  <div class="fill hand">&nbsp;</div>
  <div class="q">En quoi la maîtrise du français sert ce projet :</div>
  <div class="fill hand">&nbsp;</div>
  <div class="note">Démarche administrative éventuelle (résidence / naturalisation) : le cas échéant, conséquence du projet professionnel ci-dessus — elle ne peut constituer l'objectif principal d'une formation financée par le CPF.</div>
  <div class="fill hand" style="min-height:34px;">&nbsp;</div>

  <div class="section-t">Niveau et besoins</div>
  <div class="q">Niveau estimé (CECRL) :</div>
  <div class="opts">${EST.map((v) => `<span>${estBox(v)}</span>`).join("")}</div>
  <div class="q">Niveau visé :</div>
  <div class="opts"><span>${viseBox("A2")}</span><span>${viseBox("B1")}</span><span>${viseBox("B2")}</span>${viseAutre}</div>
  <div class="q">Besoin de compensation (handicap) :</div>
  <div class="opts"><span>${off} Non</span><span>${off} Oui — préciser :</span><span style="flex:1;min-width:160px;border-bottom:1px solid var(--bord);">&nbsp;</span></div>
  <div class="q">Cohérence durée / écart de niveau vérifiée :</div>
  <div class="opts"><span>${off} Oui</span><span>${off} Non</span></div>

  <div class="sign">
    <div style="flex:1;">Signature du bénéficiaire ·<div class="sigbox" style="margin-top:6px;">&nbsp;</div></div>
    <div style="flex:1;">Signature du référent MYSTORY ·<div class="sigbox" style="margin-top:6px;">&nbsp;</div></div>
  </div>

  <div class="rgpd">Données personnelles (RGPD). Données traitées par MYSTORY (SASU) pour le suivi de la formation et les obligations liées au financement CPF. Conservation : 5 ans. Droits d'accès, rectification, effacement, opposition : contact@mystoryformation.fr — réclamation possible auprès de la CNIL (www.cnil.fr).</div>
  <div class="ftr">MYSTORY — SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017 · Déclaration d'activité n° 11756521775 (ne vaut pas agrément de l'État)<br>
  Gagny : 3 bis av. de Gagny, 93220 · Sarcelles : 18 av. du 8 Mai 1945, 95200 · Rosny : 46 bis rue d'Estienne d'Orves, 93110 Rosny-sous-Bois<br>
  06 81 43 16 54 · contact@mystoryformation.fr · Modèle v3</div>
</div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Lien invalide : token manquant.", { status: 400 });
  }
  let p: Record<string, any> | null = null;
  try {
    const r = await fetch(`${FN}/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const jr = await r.json().catch(() => ({}));
    if (!r.ok || !jr.ok || !jr.positionnement) {
      return new NextResponse("Positionnement introuvable.", { status: 404 });
    }
    p = jr.positionnement;
  } catch {
    return new NextResponse("Service momentanément indisponible. Réessayez.", { status: 502 });
  }
  return new NextResponse(buildFicheHtml(p as Record<string, any>), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
