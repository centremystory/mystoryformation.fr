/**
 * MYSTORY — GET /evaluation?token=...   (Évaluation initiale pré-remplie)
 * ----------------------------------------------------------------------
 * Page A4 calquée sur le modèle v3, pré-remplie à partir d'un positionnement
 * (lu via la fonction Supabase publique). Imprimable (Imprimer → PDF) et signée à la main.
 * Niveau par compétence : CE déjà /20 ; CO, EO, EE ramenés sur /20 (x2) ; barème A0→B2 du test.
 * Durée préconisée + signature : laissées à remplir à la main.
 * Public (non couvert par le middleware). Aucun secret ici.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FN = "https://svepgknbbonrtwyvzaar.supabase.co/functions/v1/positionnement";
const COLS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];

function niveau20(n: number): string {
  if (n <= 4) return "A0";
  if (n <= 9) return "A1";
  if (n <= 14) return "A2";
  if (n <= 18) return "B1";
  return "B2";
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function fmtDateFR(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
}

function buildEvalHtml(p: Record<string, any>): string {
  const ce = p.ce_sur20 != null ? Number(p.ce_sur20) : null;
  const co = p.co_sur10 != null ? Number(p.co_sur10) : null;
  const ee = p.ee_sur10 != null ? Number(p.ee_sur10) : null;
  const eo = p.eo_sur10 != null ? Number(p.eo_sur10) : null;
  const lignes: [string, string | null][] = [
    ["Compréhension orale", co != null ? niveau20(co * 2) : null],
    ["Compréhension écrite", ce != null ? niveau20(ce) : null],
    ["Expression orale", eo != null ? niveau20(eo * 2) : null],
    ["Expression écrite", ee != null ? niveau20(ee * 2) : null],
  ];
  const grid = lignes.map(([lib, lvl]) => {
    const tds = COLS.map((c) => {
      const on = c === lvl;
      return `<td class="cell${on ? " on" : ""}">${on ? "✔" : ""}</td>`;
    }).join("");
    return `<tr><th class="comp">${lib}</th>${tds}</tr>`;
  }).join("");

  const stagiaire = `${esc(p.prenom || "")} ${esc(p.nom || "")}`.trim();
  const vise = p.niveau_vise || "";
  const viseBox = (v: string) => `<span class="box${vise === v ? " on" : ""}">${vise === v ? "✔" : ""}</span> ${v}`;
  const viseAutre = vise && !["A2", "B1", "B2"].includes(vise) ? ` &nbsp;(visé : <b>${esc(vise)}</b>)` : "";
  const dateTest = fmtDateFR(p.created_at);
  const axes = esc(p.remarques || "").trim();

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MYSTORY — Évaluation initiale${stagiaire ? " — " + stagiaire : ""}</title>
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
.infos{width:100%;border-collapse:collapse;margin:6px 0 16px;}
.infos td{padding:7px 9px;border:1px solid var(--bord);font-size:13.5px;}
.infos td.k{background:var(--lite);color:var(--navy);font-weight:600;width:38%;}
.section-t{color:var(--navy);font-weight:700;font-size:13.5px;margin:16px 0 6px;}
table.grid{width:100%;border-collapse:collapse;}
table.grid th,table.grid td{border:1px solid var(--bord);text-align:center;font-size:13px;padding:8px 4px;}
table.grid thead th{background:var(--lite);color:var(--navy);}
table.grid th.comp{text-align:left;background:#fff;color:var(--ink);font-weight:600;width:30%;padding-left:10px;}
table.grid td.cell{width:10%;font-weight:800;color:#fff;}
table.grid td.cell.on{background:var(--blue);}
.global{margin:14px 0;font-size:14px;}
.global .badge{display:inline-block;background:var(--blue);color:#fff;font-weight:800;font-size:18px;padding:3px 16px;border-radius:8px;margin-left:6px;}
.line{display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:13.5px;margin:8px 0;}
.box{display:inline-block;width:16px;height:16px;border:1.5px solid var(--navy);border-radius:3px;text-align:center;line-height:14px;font-size:12px;color:#fff;vertical-align:-3px;}
.box.on{background:var(--blue);border-color:var(--blue);}
.fill{border:1px solid var(--bord);border-radius:8px;min-height:30px;padding:8px 10px;font-size:13.5px;background:#FBFCFE;white-space:pre-wrap;}
.fill.hand{min-height:34px;background:repeating-linear-gradient(transparent,transparent 28px,#E6EDF8 29px);}
.sign{display:flex;justify-content:space-between;gap:20px;margin-top:18px;font-size:13.5px;}
.sign .sigbox{flex:1;border:1px solid var(--bord);border-radius:8px;min-height:80px;padding:6px 9px;}
.rgpd{font-size:9.5px;color:var(--grey);margin-top:16px;border-top:1px solid var(--bord);padding-top:8px;}
.ftr{font-size:9.5px;color:var(--grey);text-align:center;margin-top:6px;}
.btnbar{text-align:center;margin:14px 0;}
.btn{background:var(--blue);color:#fff;border:none;border-radius:9px;padding:11px 22px;font-size:15px;font-weight:700;cursor:pointer;}
@media print{body{background:#fff;}.sheet{padding:0;}.btnbar{display:none!important;}}
</style></head>
<body>
<div class="btnbar"><button class="btn" onclick="window.print()">📄 Imprimer / Enregistrer en PDF</button></div>
<div class="sheet">
  <div class="top">
    <div class="brand">MYSTORY</div>
    <div class="legal">SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017 · Déclaration d'activité 11756521775 (ne vaut pas agrément de l'État) · contact@mystoryformation.fr</div>
  </div>

  <h1>ÉVALUATION INITIALE — POSITIONNEMENT</h1>
  <p class="subtitle">Positionnement à l'entrée</p>

  <table class="infos">
    <tr><td class="k">Stagiaire</td><td>${stagiaire || "&nbsp;"}</td></tr>
    <tr><td class="k">Formation</td><td>TEF IRN (RS6775)</td></tr>
    <tr><td class="k">Date</td><td>${dateTest || "&nbsp;"}</td></tr>
    <tr><td class="k">Formateur évaluateur</td><td>${esc(p.referent || "") || "&nbsp;"}</td></tr>
  </table>

  <div class="section-t">Niveau constaté par compétence (CECRL)</div>
  <table class="grid">
    <thead><tr><th class="comp">Compétence</th>${COLS.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${grid}</tbody>
  </table>

  <div class="global">Niveau global estimé à l'entrée (CECRL) : <span class="badge">${esc(p.niveau_global || "—")}</span></div>

  <div class="line"><b>Méthode :</b>
    <span><span class="box on">✔</span> Test de positionnement</span>
    <span><span class="box"></span> Attestation de niveau</span>
    <span><span class="box"></span> Entretien</span>
  </div>

  <div class="line"><b>Niveau visé :</b>
    <span>${viseBox("A2")}</span><span>${viseBox("B1")}</span><span>${viseBox("B2")}</span>${viseAutre}
  </div>

  <div class="section-t">Durée préconisée au regard de l'écart de niveau</div>
  <div class="fill hand">&nbsp;</div>

  <div class="section-t">Axes de travail prioritaires</div>
  <div class="fill">${axes || "&nbsp;"}</div>

  <div class="sign">
    <div>Fait le : ____ / ____ / ________<div class="sigbox" style="margin-top:6px;">&nbsp;</div></div>
    <div style="flex:1;">Signature du formateur :<div class="sigbox" style="margin-top:6px;">&nbsp;</div></div>
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
  return new NextResponse(buildEvalHtml(p as Record<string, any>), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
