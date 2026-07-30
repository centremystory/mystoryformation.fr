/**
 * MYSTORY — Génération du document « Test » détaillé (corrigé) pour le dossier.
 *
 * Distinct de l'évaluation (résumé/niveau CECRL) : ce document EST le test passé, restitué
 * QUESTION PAR QUESTION avec la correction — énoncé, options, réponse de l'élève et bonne
 * réponse (✓/✗), score par section. Il alimente la pièce `test_positionnement` (phase initial)
 * ou `test_final` (phase final) du dossier.
 *
 * Source : moteur de tests — `evaluations` (dossier_id + phase → test_id + `reponses` jsonb :
 * { question_id: "clé choisie" }) et `test_questions` (enonce, options[{cle,texte,image}],
 * bonne_reponse, section). Lieu = Gagny. Aucune antidate (generated_at = now()).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFiche, archiveDocument, setPieceStatus } from "@/lib/crm";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { journal } from "@/lib/examens";

type Phase = "initial" | "final";
const PIECE = { initial: "test_positionnement", final: "test_final" } as const;
const TITRE = { initial: "Test de positionnement — corrigé détaillé", final: "Test final — corrigé détaillé" } as const;
const SECTIONS: [string, string][] = [
  ["CE", "Compréhension écrite"],
  ["CO", "Compréhension orale"],
  ["EE", "Expression écrite"],
  ["EO", "Expression orale"],
];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso);
}

type Opt = { cle?: string; texte?: string; image?: string };
type Question = { id: string; section: string | null; ordre: number | null; contexte: string | null; enonce: string; options: Opt[] | null; bonne_reponse: string | null; points: number | null };

/** Une question est auto-corrigeable (QCM) si elle a des options et une bonne réponse. */
const estQcm = (q: Question) => Array.isArray(q.options) && q.options.length > 0 && q.bonne_reponse != null;

function htmlOption(opt: Opt, choisie: string | undefined, bonne: string | null): string {
  const cle = opt.cle ?? "";
  const estBonne = bonne != null && cle === bonne;
  const estChoisie = choisie != null && cle === choisie;
  let bg = "#fff", bord = "#DCE3EE", note = "";
  if (estBonne) { bg = "#EAF7EE"; bord = "#57B27A"; note = estChoisie ? " ✓ réponse de l'élève (correcte)" : " ✓ bonne réponse"; }
  else if (estChoisie) { bg = "#FCEBEA"; bord = "#E06A5F"; note = " ✗ réponse de l'élève"; }
  const img = opt.image ? `<img src="${esc(opt.image)}" style="max-height:54px;max-width:120px;vertical-align:middle;margin-left:6px;border-radius:4px">` : "";
  return `<div style="border:1px solid ${bord};background:${bg};border-radius:6px;padding:5px 9px;margin:3px 0;font-size:12px">
    <b>${esc(cle)}.</b> ${esc(opt.texte ?? "")}${img}<span style="color:#475569;font-weight:600">${note}</span></div>`;
}

function htmlQuestion(q: Question, num: number, choisie: string | undefined): string {
  const contexte = q.contexte ? `<div style="font-size:11px;color:#64748b;font-style:italic;margin:2px 0 4px">${esc(q.contexte)}</div>` : "";
  if (!estQcm(q)) {
    // Question ouverte (expression écrite/orale) : évaluée par la formatrice, pas d'auto-correction.
    return `<div style="margin:10px 0;padding-left:4px">
      <div style="font-weight:600;font-size:12.5px">${num}. ${esc(q.enonce)}</div>${contexte}
      <div style="font-size:11px;color:#64748b;margin-top:3px">Réponse rédigée / orale — évaluée par la formatrice (voir l'évaluation).</div></div>`;
  }
  const juste = choisie != null && choisie === q.bonne_reponse;
  const badge = choisie == null
    ? `<span style="background:#EEF2F7;color:#64748b;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">Non répondu</span>`
    : juste
      ? `<span style="background:#EAF7EE;color:#2E7D4F;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">✓ Juste</span>`
      : `<span style="background:#FCEBEA;color:#B23B30;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px">✗ Faux</span>`;
  const opts = (q.options ?? []).map((o) => htmlOption(o, choisie, q.bonne_reponse)).join("");
  return `<div style="margin:12px 0;padding:8px 4px;border-top:1px solid #EEF2F7">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="font-weight:600;font-size:12.5px">${num}. ${esc(q.enonce)}</div>${badge}
    </div>${contexte}${opts}</div>`;
}

function htmlTest(phase: Phase, fiche: any, ev: any, questions: Question[]): string {
  const reponses: Record<string, string> = (ev?.reponses && typeof ev.reponses === "object") ? ev.reponses : {};
  const parSection = new Map<string, Question[]>();
  for (const q of questions) {
    const s = String(q.section ?? "AUTRE").toUpperCase();
    (parSection.get(s) ?? parSection.set(s, []).get(s)!).push(q);
  }
  // Sections dans l'ordre officiel, puis toute section restante.
  const clesTriees = [...SECTIONS.map(([k]) => k).filter((k) => parSection.has(k)),
    ...[...parSection.keys()].filter((k) => !SECTIONS.some(([s]) => s === k))];

  let numTotal = 0, qcmTotal = 0, qcmJustes = 0;
  const blocs = clesTriees.map((cle) => {
    const libelle = SECTIONS.find(([k]) => k === cle)?.[1] ?? cle;
    const qs = (parSection.get(cle) ?? []).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    let secQcm = 0, secJustes = 0;
    const corps = qs.map((q) => {
      numTotal += 1;
      const choisie = reponses[q.id];
      if (estQcm(q)) { qcmTotal += 1; secQcm += 1; if (choisie === q.bonne_reponse) { qcmJustes += 1; secJustes += 1; } }
      return htmlQuestion(q, numTotal, choisie);
    }).join("");
    const scoreSec = secQcm > 0 ? `<span style="font-size:12px;color:#475569">Score section : <b>${secJustes}/${secQcm}</b></span>` : "";
    return `<h2 style="font-size:14px;color:#2F72DE;margin:20px 0 4px;border-bottom:2px solid #E3EBF7;padding-bottom:3px">${esc(libelle)} ${scoreSec}</h2>${corps}`;
  }).join("");

  const scoreGlobal = qcmTotal > 0 ? `${qcmJustes}/${qcmTotal} (${Math.round((qcmJustes / qcmTotal) * 100)} %)` : "—";
  const niveau = ev?.niveau_global ?? "—";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:13px;margin:0;padding:30px}
    .head{border-bottom:3px solid #2F72DE;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}
    .marque{font-size:20px;font-weight:800;color:#2F72DE;letter-spacing:.5px}
    .legal{font-size:10px;color:#64748b;line-height:1.5;text-align:right}
    h1{font-size:16px;margin:4px 0 12px}
    table.meta{border-collapse:collapse;width:100%;margin:6px 0 10px}
    table.meta td{padding:6px 10px;border:1px solid #DCE3EE}
    table.meta td.k{color:#475569;width:32%} table.meta td.v{font-weight:600}
    .score{display:inline-block;background:#EAF1FC;color:#1F56B0;font-weight:700;padding:4px 12px;border-radius:8px;font-size:14px}
    .foot{margin-top:20px;font-size:10.5px;color:#64748b;border-top:1px solid #E3EBF7;padding-top:8px}
  </style></head><body>
    <div class="head">
      <div><div class="marque">MYSTORY</div><div style="font-size:11px;color:#475569">Centre de formation FLE &amp; examen TEF IRN</div></div>
      <div class="legal">MYSTORY — SASU · SIRET 913 423 083 00017<br>NDA 11756521775 (ne vaut pas agrément de l'État)<br>3 bis av. de Gagny, 93220 Gagny · contact@mystoryformation.fr</div>
    </div>
    <h1>${esc(TITRE[phase])}</h1>
    <table class="meta">
      <tr><td class="k">Bénéficiaire</td><td class="v">${esc(`${fiche?.prenom ?? ""} ${fiche?.nom ?? ""}`.trim() || "—")}</td></tr>
      <tr><td class="k">Date du test</td><td class="v">${dateFr(ev?.complete_le ?? null)}</td></tr>
      <tr><td class="k">Score QCM (CE + CO)</td><td class="v"><span class="score">${scoreGlobal}</span></td></tr>
      <tr><td class="k">Niveau ${phase === "final" ? "atteint" : "estimé"} (CECRL)</td><td class="v">${esc(niveau)}</td></tr>
    </table>
    ${blocs || '<p style="color:#64748b">Aucune question rattachée à ce test.</p>'}
    <div class="foot">Corrigé détaillé généré à partir du test passé par le bénéficiaire (moteur de tests MYSTORY, référentiel CECRL). Les épreuves d'expression écrite et orale sont évaluées par la formatrice et figurent dans l'évaluation. Fait à Gagny, le ${dateFr(new Date().toISOString())}.</div>
  </body></html>`;
}

/**
 * Génère (ou régénère) la pièce Test détaillé du dossier depuis le dernier test passé de la phase.
 * Best-effort : ne jette pas (utilisable en hook auto à la notation).
 */
export async function genererDocTest(
  dossierId: string,
  phase: Phase,
  auteur: string | null,
): Promise<{ ok: boolean; raison?: string }> {
  try {
    const { data: ev } = await supabaseAdmin
      .from("evaluations")
      .select("id, phase, test_id, statut, reponses, complete_le, niveau_global")
      .eq("dossier_id", dossierId)
      .eq("phase", phase)
      .order("complete_le", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!ev) return { ok: false, raison: "Aucun test passé pour ce dossier (le corrigé se génère depuis le moteur de tests)." };
    if (ev.statut === "en_cours") return { ok: false, raison: "Le test n'est pas encore passé." };
    if (!ev.test_id) return { ok: false, raison: "Test non relié au moteur (test_id manquant) — utilise l'import du scan à la place." };

    const { data: questions } = await supabaseAdmin
      .from("test_questions")
      .select("id, section, ordre, contexte, enonce, options, bonne_reponse, points")
      .eq("test_id", ev.test_id)
      .order("section", { ascending: true })
      .order("ordre", { ascending: true });

    const fiche = await getFiche(dossierId);
    if (!fiche) return { ok: false, raison: "Dossier introuvable." };

    const html = htmlTest(phase, fiche, ev, (questions ?? []) as Question[]);
    const { pdf } = await renderHtmlToPdf({ html, name: `${TITRE[phase]} — ${fiche.prenom} ${fiche.nom}` });
    await archiveDocument({ dossierId, piece: PIECE[phase], variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: PIECE[phase], status: "genere", at: new Date().toISOString() });
    await journal("dossier", dossierId, "test_genere_depuis_moteur", { phase, eval_id: ev.id, questions: (questions ?? []).length }, auteur);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
