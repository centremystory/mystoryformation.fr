/**
 * MYSTORY — GET /api/dossiers/[id]/livret-pdf
 * Livret de suivi du stagiaire (archivage Qualiopi) : fiche + objectifs → positionnement
 * (4 compétences CECR) → séances émargées → tests → résultat. Consolide les données déjà
 * saisies dans le CRM. Sections « examens blancs » et « checklist jour J » = Phase 2.
 * DOCUMENT INTERNE (auth équipe).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { renderPdf } from "@/lib/renderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data: d } = await supabaseAdmin
    .from("dossiers")
    .select("id, certif, financement, niveau_initial, niveau_vise, niveau_atteint, objectif_formation, objectif_professionnel, date_debut, date_fin, heures_prevues, statut, stagiaires:stagiaire_id ( civilite, nom, prenom, date_naissance, agence, email, telephone )")
    .eq("id", params.id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  const s: any = Array.isArray((d as any).stagiaires) ? (d as any).stagiaires[0] : (d as any).stagiaires;

  const { data: pos } = await supabaseAdmin
    .from("positionnements").select("ce_sur20, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, remarques, created_at")
    .eq("dossier_id", params.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { data: seances } = await supabaseAdmin
    .from("planning").select("date_seance, demi_journee, heures, heures_realisees, emarge_le, absence, contenu")
    .eq("dossier_id", params.id).order("date_seance");

  const lignesSeances = (seances ?? []).map((x: any, i: number) => `<tr>
    <td class="n">${i + 1}</td><td>${dateFr(x.date_seance)}</td><td>${esc(x.demi_journee ?? "")}</td>
    <td class="c">${x.emarge_le ? "✓ présent" : x.absence ? "absent" : "—"}</td>
    <td>${esc(x.contenu ?? "")}</td></tr>`).join("");
  const heuresFaites = (seances ?? []).filter((x: any) => x.emarge_le).reduce((t: number, x: any) => t + Number(x.heures_realisees ?? x.heures ?? 0), 0);

  const nom = `${esc(s?.civilite ?? "")} ${esc(s?.prenom ?? "")} ${esc(s?.nom ?? "")}`.trim();

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 15mm 13mm 16mm; }
body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #1f2430; line-height: 1.4; }
h1 { background:#2F72DE; color:#fff; padding:5mm 6mm; border-radius:3mm; font-size:14pt; margin:0 0 3mm; }
.slogan { color:#2F72DE; font-size:8.5pt; font-style:italic; margin:-1mm 0 4mm; }
h2 { color:#2F72DE; font-size:11pt; border-bottom:1.5px solid #2F72DE; margin:6mm 0 2mm; padding-bottom:1mm; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:1mm 6mm; font-size:9pt; }
.k { color:#667085; } .v { font-weight:600; }
table { width:100%; border-collapse:collapse; font-size:8pt; margin-top:2mm; }
td, th { border:1px solid #e6ebf4; padding:1.4mm 2mm; vertical-align:top; } th { background:#EAF1FC; text-align:left; }
.n { width:6mm; text-align:center; color:#889; } .c { text-align:center; white-space:nowrap; }
.comp { display:flex; gap:3mm; margin:2mm 0; }
.bloc { flex:1; border:1px solid #e6ebf4; border-radius:2mm; padding:2mm; text-align:center; }
.bloc b { display:block; font-size:12pt; color:#2F72DE; }
.niveau { background:#2F72DE; color:#fff; border-radius:2mm; text-align:center; padding:2.5mm; font-size:12pt; font-weight:bold; margin:2mm 0; }
.attente { background:#FFFAEB; border:1px solid #FEDF89; color:#B54708; border-radius:2mm; padding:2.5mm; font-size:8.5pt; }
.obj { background:#f8fafc; border-left:3px solid #2F72DE; padding:2mm 3mm; margin:1.5mm 0; }
.footer { margin-top:6mm; font-size:7pt; color:#9aa1ad; text-align:center; }
</style></head><body>
<h1>Livret de suivi du stagiaire</h1>
<div class="slogan">Votre histoire, notre fierté</div>

<h2>1. Fiche stagiaire &amp; objectifs</h2>
<div class="grid">
  <div><span class="k">Stagiaire :</span> <span class="v">${nom || "—"}</span></div>
  <div><span class="k">Né(e) le :</span> <span class="v">${dateFr(s?.date_naissance)}</span></div>
  <div><span class="k">Certification :</span> <span class="v">${esc(d.certif ?? "TEF IRN")}</span></div>
  <div><span class="k">Financement :</span> <span class="v">${esc(d.financement ?? "—")}</span></div>
  <div><span class="k">Site :</span> <span class="v">${esc(s?.agence ?? "—")}</span></div>
  <div><span class="k">Période :</span> <span class="v">${dateFr(d.date_debut)} → ${dateFr(d.date_fin)}</span></div>
  <div><span class="k">Niveau visé :</span> <span class="v">${esc(d.niveau_vise ?? "—")}</span></div>
  <div><span class="k">Volume prévu :</span> <span class="v">${esc(d.heures_prevues ?? "—")} h</span></div>
</div>
<div class="obj"><b>Objectif de formation :</b> ${esc(d.objectif_formation ?? "— à compléter —")}</div>
<div class="obj"><b>Objectif professionnel :</b> ${esc(d.objectif_professionnel ?? "— à compléter —")}</div>

<h2>2. Grille de positionnement (CECR)</h2>
${pos ? `<div class="comp">
  <div class="bloc">Compréhension écrite<b>${esc(pos.ce_sur20 ?? "—")}/20</b></div>
  <div class="bloc">Compréhension orale<b>${esc(pos.co_sur10 ?? "—")}/10</b></div>
  <div class="bloc">Expression écrite<b>${esc(pos.ee_sur10 ?? "—")}/10</b></div>
  <div class="bloc">Expression orale<b>${esc(pos.eo_sur10 ?? "—")}/10</b></div>
</div>
<div class="niveau">Niveau de positionnement : ${esc(pos.niveau_global ?? "—")}</div>
${pos.remarques ? `<p style="font-size:8.5pt;color:#475467;">Remarques : ${esc(pos.remarques)}</p>` : ""}` : `<div class="attente">Positionnement non encore enregistré.</div>`}

<h2>3. Suivi des séances (${(seances ?? []).length} séance(s) · ${Math.round(heuresFaites * 10) / 10} h réalisées)</h2>
${lignesSeances ? `<table><tr><th>#</th><th>Date</th><th>Demi-j.</th><th>Présence</th><th>Contenu</th></tr>${lignesSeances}</table>` : `<div class="attente">Aucune séance enregistrée.</div>`}

<h2>4. Examens blancs (scores /699 par épreuve)</h2>
<div class="attente">Section à compléter par la formatrice (saisie CRM — Phase 2).</div>

<h2>5. Checklist jour J</h2>
<div class="attente">Section à compléter (saisie CRM — Phase 2).</div>

<h2>6. Résultat final &amp; suite</h2>
<div class="grid">
  <div><span class="k">Niveau initial :</span> <span class="v">${esc(d.niveau_initial ?? "—")}</span></div>
  <div><span class="k">Niveau visé :</span> <span class="v">${esc(d.niveau_vise ?? "—")}</span></div>
  <div><span class="k">Niveau atteint :</span> <span class="v">${esc(d.niveau_atteint ?? "— en cours —")}</span></div>
  <div><span class="k">Statut du dossier :</span> <span class="v">${esc(d.statut ?? "—")}</span></div>
</div>
<p style="font-size:8.5pt;color:#475467;margin-top:2mm;">Suite : réussite du niveau visé · repassage (165 €, carence 20 j) · réorientation.</p>

<div class="footer">MYSTORY Formation · 3 bis avenue de Gagny, 93220 Gagny · TEF IRN (RS6775) · Livret de suivi — archivage Qualiopi.</div>
</body></html>`;

  let pdf: Buffer;
  try { pdf = await renderPdf(html); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: "Rendu PDF échoué : " + (e?.message || String(e)) }, { status: 500 }); }
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="livret-suivi-${(s?.nom ?? "stagiaire").toString().toLowerCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
