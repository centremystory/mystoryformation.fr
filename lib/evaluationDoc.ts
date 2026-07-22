/**
 * MYSTORY — Génération du document « Évaluation (test de positionnement) » pour le dossier.
 *
 * Le moteur de tests (table `evaluations`) porte le résultat réel d'un test passé/noté
 * (CE/CO auto + EE/EO formateur + niveau estimé). Cette lib transforme ce résultat en
 * PIÈCE de conformité du dossier : un PDF récapitulatif archivé, et la pièce
 * `evaluation_initiale` / `evaluation_finale` passée à « généré ».
 *
 * Option A (décision Arudhan) : le test EST l'évaluation → une seule pièce par phase,
 * remplie automatiquement depuis le moteur (auto à la notation + bouton de (re)génération).
 *
 * Lieu = Gagny forcé (seul site Qualiopi). Aucune antidate (generated_at = trigger now()).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFiche, archiveDocument, setPieceStatus } from "@/lib/crm";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { journal } from "@/lib/examens";

const PIECE = { initial: "evaluation_initiale", final: "evaluation_finale" } as const;
const LIBELLE = { initial: "Évaluation initiale (test de positionnement)", final: "Évaluation finale (test final)" } as const;
type Phase = "initial" | "final";

const LIBELLE_CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL FLE" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const n10 = (v: unknown) => (v == null || v === "" ? "—" : `${Number(v)}/10`);
function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso);
}

function htmlEvaluation(phase: Phase, fiche: any, ev: any): string {
  const titre = LIBELLE[phase];
  const certif = LIBELLE_CERTIF[fiche?.certif] ?? fiche?.certif ?? "—";
  const dateDoc = dateFr(ev?.complete_le ?? null);
  const total = ev?.total_sur20 == null ? "—" : `${Number(ev.total_sur20)}/20`;
  const niveau = ev?.niveau_global ?? "—";
  const ligne = (label: string, valeur: string) =>
    `<tr><td style="padding:6px 10px;border:1px solid #DCE3EE;color:#475569">${esc(label)}</td><td style="padding:6px 10px;border:1px solid #DCE3EE;font-weight:600;color:#0f172a">${esc(valeur)}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:13px;margin:0;padding:32px}
    .head{border-bottom:3px solid #2F72DE;padding-bottom:12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start}
    .marque{font-size:20px;font-weight:800;color:#2F72DE;letter-spacing:.5px}
    .legal{font-size:10px;color:#64748b;line-height:1.5;text-align:right}
    h1{font-size:16px;margin:6px 0 14px}
    table{border-collapse:collapse;width:100%;margin:8px 0 16px}
    .niveau{display:inline-block;background:#EAF1FC;color:#1F56B0;font-weight:700;padding:4px 12px;border-radius:8px;font-size:15px}
    .foot{margin-top:26px;font-size:11px;color:#475569}
    .sig{margin-top:34px;display:flex;justify-content:space-between}
    .sig div{width:45%;border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#475569}
  </style></head><body>
    <div class="head">
      <div><div class="marque">MYSTORY</div><div style="font-size:11px;color:#475569">Centre de formation FLE &amp; examen TEF IRN</div></div>
      <div class="legal">MYSTORY — SASU · SIRET 913 423 083 00017<br>NDA 11756521775 (ne vaut pas agrément de l'État)<br>3 bis av. de Gagny, 93220 Gagny · contact@mystoryformation.fr</div>
    </div>

    <h1>${esc(titre)}</h1>

    <table>
      ${ligne("Bénéficiaire", `${fiche?.prenom ?? ""} ${fiche?.nom ?? ""}`.trim() || "—")}
      ${ligne("Certification visée", certif)}
      ${ligne("Niveau visé", ev?.niveau_vise ?? fiche?.niveauVise ?? "—")}
      ${ligne("Date d'évaluation", dateDoc)}
    </table>

    <table>
      <tr><th style="text-align:left;padding:6px 10px;border:1px solid #DCE3EE;background:#F4F7FB">Compétence</th><th style="text-align:left;padding:6px 10px;border:1px solid #DCE3EE;background:#F4F7FB">Score</th></tr>
      ${ligne("Compréhension écrite (CE)", n10(ev?.ce_sur10))}
      ${ligne("Compréhension orale (CO)", n10(ev?.co_sur10))}
      ${ligne("Expression écrite (EE)", n10(ev?.ee_sur10))}
      ${ligne("Expression orale (EO)", n10(ev?.eo_sur10))}
      ${ligne("Total", total)}
    </table>

    <p>Niveau ${phase === "final" ? "atteint" : "estimé"} (CECRL) : <span class="niveau">${esc(niveau)}</span></p>

    <div class="foot">Évaluation réalisée selon le référentiel CECRL. Document généré à partir du test passé par le bénéficiaire.</div>
    <div class="sig"><div>Le bénéficiaire</div><div>Pour MYSTORY (la formatrice)</div></div>
    <p style="margin-top:22px;font-size:11px;color:#475569">Fait à Gagny, le ${dateFr(new Date().toISOString())}.</p>
  </body></html>`;
}

/**
 * Génère (ou régénère) la pièce d'évaluation du dossier à partir du dernier test de la phase.
 * Retourne { ok, raison? }. Best-effort : ne jette pas (utilisable en hook auto).
 */
export async function genererDocEvaluation(
  dossierId: string,
  phase: Phase,
  auteur: string | null,
): Promise<{ ok: boolean; raison?: string }> {
  try {
    const { data: ev } = await supabaseAdmin
      .from("evaluations")
      .select("id, phase, dossier_id, statut, niveau_vise, ce_sur10, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, complete_le")
      .eq("dossier_id", dossierId)
      .eq("phase", phase)
      .order("complete_le", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!ev) return { ok: false, raison: "Aucun test pour ce dossier." };
    if (ev.statut === "en_cours") return { ok: false, raison: "Le test n'est pas encore passé." };

    const fiche = await getFiche(dossierId);
    if (!fiche) return { ok: false, raison: "Dossier introuvable." };

    const html = htmlEvaluation(phase, fiche, ev);
    const { pdf } = await renderHtmlToPdf({ html, name: `${LIBELLE[phase]} — ${fiche.prenom} ${fiche.nom}` });
    await archiveDocument({ dossierId, piece: PIECE[phase], variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: PIECE[phase], status: "genere", at: new Date().toISOString() });
    await journal("dossier", dossierId, "evaluation_generee_depuis_test", { phase, eval_id: ev.id, niveau: ev.niveau_global }, auteur);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * SAISIE MANUELLE (test passé sur papier ou évalué à la main par l'équipe).
 * Génère le MÊME document d'évaluation à partir de scores saisis, SANS écrire dans la table
 * `evaluations` (réservée au moteur de test en ligne ; test_id y est obligatoire). Best-effort.
 */
export async function genererDocEvaluationManuelle(
  dossierId: string,
  phase: Phase,
  scores: { ce: number; co: number; ee: number; eo: number; niveau_global: string; remarques?: string | null },
  auteur: string | null,
): Promise<{ ok: boolean; raison?: string }> {
  try {
    const fiche = await getFiche(dossierId);
    if (!fiche) return { ok: false, raison: "Dossier introuvable." };
    const total = Math.round(((scores.ce + scores.co + scores.ee + scores.eo) / 2) * 10) / 10;
    const ev = {
      ce_sur10: scores.ce, co_sur10: scores.co, ee_sur10: scores.ee, eo_sur10: scores.eo,
      total_sur20: total, niveau_global: scores.niveau_global,
      niveau_vise: fiche.niveauVise ?? null, complete_le: new Date().toISOString(),
    };
    const html = htmlEvaluation(phase, fiche, ev);
    const { pdf } = await renderHtmlToPdf({ html, name: `${LIBELLE[phase]} — ${fiche.prenom} ${fiche.nom}` });
    await archiveDocument({ dossierId, piece: PIECE[phase], variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: PIECE[phase], status: "genere", at: new Date().toISOString() });
    await journal("dossier", dossierId, "evaluation_saisie_manuelle", { phase, niveau: scores.niveau_global, total }, auteur);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }
}
