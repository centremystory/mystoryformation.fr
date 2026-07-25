/**
 * MYSTORY — GET /api/tests/[id]/sujet-pdf
 * Sujet du test EN CLAIR (sans les réponses) : à imprimer / remettre au candidat.
 * Compréhension écrite + orale (questions + choix), expression écrite (sujets par niveau),
 * expression orale (consignes). DOCUMENT INTERNE (auth équipe).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { renderPdf } from "@/lib/renderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data: t } = await supabaseAdmin
    .from("tests")
    .select("id, titre, phase, certif, consigne_ecrit, consigne_oral, sujets_ecrit, oral_questions")
    .eq("id", params.id).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("section, ordre, enonce, type, options, points")
    .eq("test_id", params.id).order("section").order("ordre");

  const optsHtml = (q: any) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (q.type === "texte_libre") return `<div class="lib">Réponse : ______________________________________________</div>`;
    if (!opts.length) return "";
    return `<ol class="opts">${opts.map((o: any) => `<li>${esc(o.texte ?? o.label ?? "")}</li>`).join("")}</ol>`;
  };
  const section = (sec: string, titre: string) => {
    const rows = (qs ?? []).filter((q: any) => q.section === sec);
    if (!rows.length) return "";
    return `<h2>${titre}</h2>${rows.map((q: any, i: number) => `<div class="q"><span class="n">${i + 1}.</span> ${esc(q.enonce)}${optsHtml(q)}</div>`).join("")}`;
  };

  const sujets = Array.isArray(t.sujets_ecrit) ? t.sujets_ecrit : [];
  const ee = `<h2>Expression écrite</h2>${t.consigne_ecrit ? `<p class="consigne">${esc(t.consigne_ecrit)}</p>` : ""}${
    sujets.length ? `<ul class="sujets">${sujets.map((s: any) => `<li><b>${esc(s.niveau ?? "")}</b> — ${esc(s.sujet ?? s.consigne ?? "")}${s.mots_min ? ` <i>(${esc(s.mots_min)} mots min.)</i>` : ""}</li>`).join("")}</ul>` : ""
  }<div class="reponse">Rédaction : <div class="lignes"></div></div>`;

  const oraux = Array.isArray(t.oral_questions) ? t.oral_questions : [];
  const eo = `<h2>Expression orale</h2>${t.consigne_oral ? `<p class="consigne">${esc(t.consigne_oral)}</p>` : ""}${
    oraux.length ? `<ol class="opts">${oraux.map((o: any) => `<li>${esc(typeof o === "string" ? o : (o?.question ?? o?.consigne ?? ""))}</li>`).join("")}</ol>` : ""
  }`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 16mm 14mm 18mm; }
body { font-family: Arial, sans-serif; font-size: 10pt; color: #1f2430; line-height: 1.45; }
h1 { background:#2F72DE; color:#fff; padding:5mm 6mm; border-radius:3mm; font-size:15pt; margin:0 0 3mm; }
.meta { color:#556; font-size:9pt; margin-bottom:6mm; }
.candidat { border:1px dashed #cbd5e1; border-radius:2mm; padding:3mm 4mm; font-size:9pt; color:#475467; margin-bottom:6mm; }
h2 { color:#2F72DE; font-size:11.5pt; border-bottom:1.5px solid #2F72DE; margin:7mm 0 3mm; padding-bottom:1mm; }
.q { margin:0 0 3mm; }
.n { font-weight:700; color:#2F72DE; }
.opts { margin:1.5mm 0 0 6mm; padding:0; }
.opts li { list-style:upper-alpha; margin:0.5mm 0; }
.lib { color:#98A2B3; margin-top:1.5mm; font-style:italic; }
.consigne { background:#f8fafc; border-left:3px solid #2F72DE; padding:2.5mm 3mm; margin:2mm 0; }
.sujets { margin:2mm 0 2mm 5mm; } .sujets li { margin:1mm 0; }
.reponse { margin-top:3mm; font-size:9pt; color:#667085; }
.lignes { height:38mm; border:1px solid #e6ebf4; border-radius:2mm; margin-top:1.5mm;
  background:repeating-linear-gradient(#fff, #fff 7mm, #eef2f7 7mm, #eef2f7 7.3mm); }
.footer { margin-top:8mm; font-size:7.5pt; color:#9aa1ad; text-align:center; }
</style></head><body>
<h1>${esc(t.titre)}</h1>
<div class="meta">Test ${t.phase === "final" ? "final" : "de positionnement"} · ${esc(t.certif)} · MYSTORY Formation</div>
<div class="candidat">Nom : ______________________  Prénom : ______________________  Date : ____ / ____ / ______</div>
${section("CE", "Compréhension écrite")}
${section("CO", "Compréhension orale")}
${ee}
${eo}
<div class="footer">MYSTORY Formation · 3 bis avenue de Gagny, 93220 Gagny · Préparation au TEF IRN (RS6775) · Document de travail — sujet sans corrigé.</div>
</body></html>`;

  let pdf: Buffer;
  try { pdf = await renderPdf(html); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: "Rendu PDF échoué : " + (e?.message || String(e)) }, { status: 500 }); }
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="sujet-${t.phase === "final" ? "final" : "initial"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
