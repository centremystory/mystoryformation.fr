/**
 * MYSTORY — Correction détaillée d'un test, en PDF.
 *
 * Extrait de app/api/tests/[id]/correction-pdf/route.ts le 17/09/2026 : le même
 * document doit pouvoir être téléchargé depuis le back-office ET joint à l'e-mail
 * interne envoyé à la notation. Deux implémentations, ce sont deux documents qui
 * divergent le jour où l'un des deux est corrigé.
 *
 * DOCUMENT INTERNE. Il contient les corrigés de la banque de questions : il se
 * remet en main propre au candidat, et ne part JAMAIS dans un e-mail candidat.
 * L'e-mail interne (équipe) est le seul envoi automatique autorisé.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderPdf } from "@/lib/renderPdf";
import { texteLibreOk } from "@/lib/tests";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type CorrectionPdf = { nom: string; contenu: Buffer };

/** Motif de non-production, pour que l'appelant puisse répondre juste. */
export type EchecCorrection = { erreur: string; code: number };

/**
 * Construit le PDF de correction. Renvoie soit le document, soit le motif.
 * Ne lève pas pour un test introuvable ou non noté : ce sont des cas normaux.
 */
export async function construireCorrectionPdf(
  id: string,
): Promise<CorrectionPdf | EchecCorrection> {
  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, phase, civilite, nom, prenom, niveau_vise, reponses, ecrit, sujet_ecrit, ce_sur10, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, statut, notateur, remarques, cree_le, complete_le, oral_evaluation_mode, oral_status, oral_score, oral_level_estimated, oral_examiner_comment, oral_strengths, oral_improvement_areas, oral_recommendation")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return { erreur: "Test introuvable.", code: 404 };
  if (ev.statut !== "complet") {
    return { erreur: "La correction détaillée est disponible après la notation complète.", code: 409 };
  }

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("id, section, ordre, enonce, type, options, bonne_reponse, mots_cles, points")
    .eq("test_id", ev.test_id)
    .order("section")
    .order("ordre");

  const reponses = (ev.reponses ?? {}) as Record<string, string>;
  const libOption = (q: any, val: string | null | undefined): string => {
    if (val == null || val === "") return "—";
    const opts = Array.isArray(q.options) ? q.options : [];
    const o = opts.find((x: any) => String(x.id ?? x.valeur ?? x.lettre ?? "") === String(val));
    return o ? `${String(val).toUpperCase()}. ${o.texte ?? o.label ?? ""}` : String(val);
  };

  const lignes = (section: "CE" | "CO") =>
    (qs ?? [])
      .filter((q) => q.section === section)
      .map((q: any, i: number) => {
        const rep = reponses[q.id];
        const ok =
          q.type === "texte_libre"
            ? texteLibreOk(rep, q.mots_cles)
            : rep != null && String(rep) === String(q.bonne_reponse);
        const bonne =
          q.type === "texte_libre"
            ? `mots attendus : ${(q.mots_cles ?? []).join(", ")}`
            : libOption(q, q.bonne_reponse);
        return `<tr>
      <td class="n">${i + 1}</td>
      <td>${esc(q.enonce).slice(0, 160)}${String(q.enonce ?? "").length > 160 ? "…" : ""}</td>
      <td class="${ok ? "ok" : "ko"}">${esc(q.type === "texte_libre" ? rep ?? "—" : libOption(q, rep))}</td>
      <td>${esc(bonne)}</td>
      <td class="pt">${ok ? `+${q.points}` : "0"}/${q.points} ${ok ? "✓" : "✗"}</td>
    </tr>`;
      })
      .join("");

  // Section orale — 3 cas (à distance / sur place / non requise), sans JAMAIS inventer.
  const ORAL_MODE_LABEL: Record<string, string> = {
    remote_recording: "Enregistrements audio à distance",
    onsite_examiner: "Entretien oral sur place (examinateur)",
    not_required: "Épreuve orale non requise",
    pending: "En attente d'évaluation",
  };
  const oralMode = String(ev.oral_evaluation_mode ?? "");
  const oralDetails: string[] = [];
  if (ev.oral_level_estimated) oralDetails.push(`<p><b>Niveau estimé à l'oral :</b> ${esc(ev.oral_level_estimated)}</p>`);
  if (ev.oral_strengths) oralDetails.push(`<p><b>Points forts :</b> ${esc(ev.oral_strengths)}</p>`);
  if (ev.oral_improvement_areas) oralDetails.push(`<p><b>Axes d'amélioration :</b> ${esc(ev.oral_improvement_areas)}</p>`);
  if (ev.oral_recommendation) oralDetails.push(`<p><b>Recommandation :</b> ${esc(ev.oral_recommendation)}</p>`);
  const oralComment = ev.oral_examiner_comment || ev.remarques;
  if (oralComment) oralDetails.push(`<p><b>Commentaire de l'examinateur :</b> ${esc(oralComment)}</p>`);

  let oralBody: string;
  if (oralMode === "not_required" || ev.oral_status === "not_applicable") {
    oralBody = `<p>Épreuve orale non requise pour ce test.</p>`;
  } else {
    const entete = `<p style="color:#556;font-size:8pt;margin:0 0 1mm;">Modalité : ${esc(ORAL_MODE_LABEL[oralMode] ?? "—")}</p>`;
    oralBody = entete + (oralDetails.length ? oralDetails.join("") : `<p><em>Correction détaillée à compléter par le formateur.</em></p>`);
  }

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm 12mm 16mm; }
body { font-family: Arial, sans-serif; font-size: 9pt; color: #1f2430; }
h1 { background:#2F72DE; color:#fff; padding:4mm 5mm; border-radius:2.5mm; font-size:13pt; margin:0 0 2mm; }
.meta { color:#556; font-size:8.5pt; margin-bottom:4mm; }
h2 { color:#2F72DE; font-size:10.5pt; border-bottom:1.5px solid #2F72DE; margin:5mm 0 2mm; padding-bottom:0.5mm; }
table { width:100%; border-collapse:collapse; font-size:8pt; }
td, th { border:1px solid #e6ebf4; padding:1.4mm 2mm; vertical-align:top; }
th { background:#EAF1FC; text-align:left; }
.n { width:6mm; text-align:center; color:#889; }
.pt { width:16mm; text-align:center; white-space:nowrap; }
.ok { background:#f0fdf4; } .ko { background:#fef2f2; }
.recap { display:flex; gap:3mm; margin:3mm 0; }
.bloc { flex:1; border:1px solid #e6ebf4; border-radius:2.5mm; padding:2.5mm; text-align:center; }
.bloc b { font-size:12pt; color:#2F72DE; display:block; }
.niveau { background:#2F72DE; color:#fff; border-radius:2.5mm; text-align:center; padding:3mm; font-size:14pt; font-weight:bold; margin:3mm 0; }
.ee { background:#f8fafc; border:1px solid #e6ebf4; border-radius:2.5mm; padding:3mm; white-space:pre-wrap; font-size:8.5pt; }
.footer { margin-top:5mm; font-size:7pt; color:#9aa1ad; text-align:center; }
.confid { background:#fff7ed; border:1px solid #fed7aa; border-radius:2.5mm; padding:2.5mm; font-size:7.5pt; color:#92400e; margin-top:3mm; }
</style></head><body>
<h1>Correction détaillée — Test ${ev.phase === "final" ? "final" : "de positionnement"}</h1>
<div class="meta">${esc(ev.civilite ?? "")} ${esc(ev.prenom ?? "")} ${esc(ev.nom ?? "")} · passé le ${new Date(ev.cree_le).toLocaleDateString("fr-FR")} · corrigé le ${ev.complete_le ? new Date(ev.complete_le).toLocaleDateString("fr-FR") : "—"}${ev.notateur ? ` par ${esc(ev.notateur)}` : ""}${ev.niveau_vise ? ` · objectif : ${esc(ev.niveau_vise)}` : ""}</div>
<div class="niveau">Niveau global : ${esc(ev.niveau_global ?? "—")} — ${esc(ev.total_sur20 ?? "—")}/20</div>
<div class="recap">
  <div class="bloc">Compréhension écrite<b>${esc(ev.ce_sur10 ?? "—")}/10</b></div>
  <div class="bloc">Compréhension orale<b>${esc(ev.co_sur10 ?? "—")}/10</b></div>
  <div class="bloc">Expression écrite<b>${esc(ev.ee_sur10 ?? "—")}/10</b></div>
  <div class="bloc">Expression orale<b>${esc(ev.eo_sur10 ?? "—")}/10</b></div>
</div>

<h2>Compréhension écrite — détail</h2>
<table><tr><th>#</th><th>Question</th><th>Votre réponse</th><th>Bonne réponse</th><th>Points</th></tr>${lignes("CE")}</table>

<h2>Compréhension orale — détail</h2>
<table><tr><th>#</th><th>Question</th><th>Votre réponse</th><th>Bonne réponse</th><th>Points</th></tr>${lignes("CO")}</table>

<h2>Expression écrite${ev.sujet_ecrit ? ` — sujet ${esc(ev.sujet_ecrit)}` : ""} · ${esc(ev.ee_sur10 ?? "—")}/10</h2>
<div class="ee">${esc(ev.ecrit ?? "— pas de rédaction —")}</div>

<h2>Expression orale · ${esc(ev.eo_sur10 ?? ev.oral_score ?? "—")}/10</h2>
<div style="font-size:8.5pt;">${oralBody}</div>

<div class="confid">⚠️ Document confidentiel remis en main propre — il contient les corrigés MYSTORY. Merci de ne pas le diffuser.</div>
<div class="footer">MYSTORY SASU · 3 bis avenue de Gagny, 93220 Gagny · SIRET 913 423 083 00017 · NDA 11756521775 (ne vaut pas agrément de l'État)</div>
</body></html>`;

  try {
    const contenu = await renderPdf(html);
    const base = [ev.nom, ev.prenom].filter(Boolean).join("_") || "test";
    const nom = `Correction_${base.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.pdf`;
    return { nom, contenu };
  } catch (e: any) {
    return { erreur: "Rendu PDF échoué : " + (e?.message || String(e)), code: 500 };
  }
}

export function estEchec(r: CorrectionPdf | EchecCorrection): r is EchecCorrection {
  return (r as EchecCorrection).erreur !== undefined;
}
