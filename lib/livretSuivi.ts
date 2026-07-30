/**
 * MYSTORY — Livret de suivi du stagiaire (TEF IRN), généré en PDF.
 *
 * Digitalise le livret papier « Mon parcours TEF IRN » : reprend la charte bleue et les
 * 8 sections du modèle. Incrément 1 (socle) : PRÉ-REMPLIT automatiquement tout ce que le CRM
 * possède déjà — couverture (fiche + offre + objectif), positionnement (évaluation initiale),
 * séances (planning/émargement), résultats (niveau atteint). Les sections « saisie formatrice »
 * (évaluations de séquence, examens blancs, checklist jour J, bilan) sont laissées en tableaux
 * à compléter — la saisie digitale arrive à l'incrément 2.
 *
 * Lieu = Gagny. Aucune antidate.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFiche } from "@/lib/crm";
import { offreParHeures } from "@/lib/programmesTefIrn";

const NAVY = "#16213E";
const BLEU = "#2F72DE";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function dateFr(iso?: string | null): string {
  if (!iso) return "";
  const d = String(iso).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso);
}
const OFFRE_LABEL: Record<string, string> = {
  A2: "Français du quotidien et de l'emploi — Objectif A2",
  B1: "Gagner en autonomie professionnelle et administrative — Objectif B1",
  B2: "Argumenter et évoluer en contexte professionnel — Objectif B2",
  INTENSIF: "Intensif — stratégies et examens blancs",
};
const OBJECTIF: Record<string, string> = {
  A2: "Carte de séjour pluriannuelle (A2)",
  B1: "Carte de résident (B1)",
  B2: "Naturalisation (B2)",
};
const n699 = (v: unknown) => (v == null || v === "" ? "" : String(v));
/** Coche cochée selon la valeur visée. */
const box = (coche: boolean) => (coche ? "☑" : "☐");

type Ev = { ce_sur10?: number; co_sur10?: number; ee_sur10?: number; eo_sur10?: number; niveau_global?: string | null; remarques?: string | null; complete_le?: string | null; notateur?: string | null };

function lignesSeances(planning: Array<{ date?: string; demiJournee?: string; heures: number }>, de: number, a: number, extra: string[] = []): string {
  const seances = [...planning].sort((x, y) => String(x.date ?? "").localeCompare(String(y.date ?? "")));
  const nums: (number | string)[] = [];
  for (let i = de; i <= a; i++) nums.push(i);
  extra.forEach((e) => nums.push(e));
  return nums.map((num, idx) => {
    const s = typeof num === "number" ? seances[num - 1] : undefined; // R/C non mappés au planning
    const demi = s?.demiJournee === "matin" ? "Matin" : s?.demiJournee === "apres_midi" ? "Après-midi" : "";
    const sig = s ? "✓ émargé" : "";
    return `<tr><td class="c">${num}</td><td>${s ? dateFr(s.date) : ""}</td><td></td><td></td><td class="c" style="color:#2E7D4F;font-size:8pt">${s ? (demi ? demi + " · " : "") + sig : ""}</td></tr>`;
  }).join("");
}

export async function genererLivretSuiviHtml(dossierId: string): Promise<string | null> {
  const fiche: any = await getFiche(dossierId);
  if (!fiche) return null;

  const { data: evData } = await supabaseAdmin
    .from("evaluations")
    .select("ce_sur10, co_sur10, ee_sur10, eo_sur10, niveau_global, remarques, complete_le, notateur")
    .eq("dossier_id", dossierId).eq("phase", "initial")
    .order("complete_le", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const ev = (evData ?? {}) as Ev;

  // Champs saisis par la formatrice (incrément 2) — garnissent les sections « à compléter ».
  const { data: livretRow } = await supabaseAdmin.from("livrets_suivi").select("donnees").eq("dossier_id", dossierId).maybeSingle();
  const D: any = (livretRow as any)?.donnees ?? {};

  const offre = offreParHeures(fiche.heuresPrevues);
  const nom = `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim();
  const objectifCoche = (k: string) => box(fiche.niveauVise === k);
  const niveauViseBox = (k: string) => box(fiche.niveauVise === k);

  const planning = (fiche.planning ?? []) as Array<{ date?: string; demiJournee?: string; heures: number }>;
  const compRow = (label: string, score?: number) =>
    `<tr><td>${label}</td><td class="c">${score != null ? `${score}/10${fiche.niveauInitial ? " · " + esc(fiche.niveauInitial) : ""}` : (fiche.niveauInitial ? esc(fiche.niveauInitial) : "")}</td><td></td></tr>`;

  const H = `
<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color:#1c2433; font-size:9.5pt; margin:0; }
  .cover { background:${NAVY}; color:#fff; border-radius:10px; padding:26px; margin-bottom:14px; }
  .cover h1 { font-size:22pt; margin:14px 0 2px; }
  .cover .slog { color:#9db4e0; font-style:italic; margin-bottom:14px; }
  .cover .card { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15); border-radius:8px; padding:16px 18px; line-height:1.9; }
  .brand { font-size:16pt; font-weight:800; letter-spacing:.5px; }
  .sec { page-break-inside:avoid; margin-top:16px; }
  h2 { color:${BLEU}; font-size:12pt; border-bottom:2px solid #E3EBF7; padding-bottom:3px; margin:14px 0 6px; }
  .intro { background:#EAF1FC; border-left:3px solid ${BLEU}; padding:8px 12px; font-size:9pt; border-radius:4px; margin:6px 0; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:9pt; }
  th { background:${NAVY}; color:#fff; text-align:left; padding:5px 7px; font-size:8.4pt; }
  td { border:1px solid #d8e0ec; padding:6px 7px; vertical-align:top; }
  td.c { text-align:center; }
  tr:nth-child(even) td { background:#F5F8FD; }
  .box { border:1.5px solid ${BLEU}; border-radius:8px; padding:10px 14px; margin:8px 0; }
  .foot { margin-top:10px; border-top:1px solid #e3e8f0; padding-top:5px; font-size:7pt; color:#7a8290; text-align:center; }
  .fill { color:#b9c2d0; }
</style></head><body>

  <!-- COUVERTURE -->
  <div class="cover">
    <div class="brand">MYSTORY</div>
    <h1>Mon livret de suivi — Préparation au TEF IRN</h1>
    <div class="slog">Votre histoire, notre fierté</div>
    <div class="card">
      <div><b>Prénom et nom :</b> ${esc(nom) || '<span class="fill">……………</span>'}</div>
      <div><b>Mon offre :</b> ${offre ? esc(OFFRE_LABEL[offre]) : '<span class="fill">……………</span>'}</div>
      <div><b>Ma formule :</b> ${fiche.heuresPrevues ? esc(String(fiche.heuresPrevues)) + " h" : '<span class="fill">……</span>'} &nbsp;·&nbsp; <b>N° de dossier :</b> ${esc(fiche.numeroDossier) || '<span class="fill">……………</span>'}</div>
      <div><b>Date de début :</b> ${dateFr(fiche.dateDebut) || '<span class="fill">……</span>'} &nbsp;·&nbsp; <b>Date de fin prévue :</b> ${dateFr(fiche.dateFin) || '<span class="fill">……</span>'}</div>
      <div><b>Ma formatrice référente :</b> ${esc(fiche.formatrice) || '<span class="fill">……………</span>'}</div>
      <div><b>Mon objectif :</b> ${objectifCoche("A2")} Carte de séjour pluriannuelle (A2) &nbsp; ${objectifCoche("B1")} Carte de résident (B1) &nbsp; ${objectifCoche("B2")} Naturalisation (B2) &nbsp; ☐ Objectif professionnel</div>
    </div>
  </div>

  <!-- POSITIONNEMENT -->
  <div class="sec">
    <div class="intro">Le TEF IRN est un examen de <b>1 h 30</b> — 4 épreuves : CE (20 q/30 min), CO (20 q/20 min), EE (2 tâches), EO (2×5 min). Il se passe chez MYSTORY à Gagny ; l'inscription est faite par MYSTORY, le coût est compris dans la formation.</div>
    <h2>Mon test de positionnement</h2>
    <div style="font-size:9pt;margin-bottom:4px"><b>Date :</b> ${dateFr(ev.complete_le) || '<span class="fill">……………</span>'} &nbsp;·&nbsp; <b>Réalisé avec :</b> ${esc(ev.notateur) || '<span class="fill">……………</span>'}</div>
    <table>
      <thead><tr><th>Compétence</th><th style="width:26%">Mon niveau de départ</th><th style="width:34%">Observations de la formatrice</th></tr></thead>
      <tbody>
        ${compRow("Compréhension écrite (lire)", ev.ce_sur10)}
        ${compRow("Compréhension orale (écouter)", ev.co_sur10)}
        ${compRow("Expression écrite (écrire)", ev.ee_sur10)}
        ${compRow("Expression orale (parler)", ev.eo_sur10)}
      </tbody>
    </table>
    <div class="box">
      <b>Décision après le positionnement</b><br>
      Niveau visé : ${niveauViseBox("A2")} A2 &nbsp; ${niveauViseBox("B1")} B1 &nbsp; ${niveauViseBox("B2")} B2 &nbsp;·&nbsp; Formule retenue : ${fiche.heuresPrevues ? esc(String(fiche.heuresPrevues)) + " heures" : '<span class="fill">……</span>'}<br>
      ${ev.remarques ? `Observations : ${esc(ev.remarques)}<br>` : ""}
      Signature du stagiaire : <span class="fill">………………</span> &nbsp; Signature MYSTORY : <span class="fill">………………</span>
    </div>
  </div>

  <!-- SÉANCES -->
  <div class="sec">
    <h2>Mes séances</h2>
    <table>
      <thead><tr><th style="width:6%">N°</th><th style="width:16%">Date</th><th>Ce que j'ai travaillé</th><th>Ma production du jour</th><th style="width:20%">Émargement</th></tr></thead>
      <tbody>${lignesSeances(planning, 1, 15, ["R/C 1", "R/C 2", "R/C 3", "R/C 4"])}</tbody>
    </table>
    <div class="intro" style="background:#F5F8FD;border-color:#c9d6ea">Séances de 3 h (matin 9h30–12h30 ou après-midi 14h–17h), groupe de 6 max. Les dates et l'émargement sont repris automatiquement du planning ; la formatrice complète « travaillé / production ». Lignes R/C = formules Renforcée/Complète.</div>
  </div>

  <!-- ÉVALUATIONS DE SÉQUENCE -->
  <div class="sec">
    <h2>Mes évaluations de séquence</h2>
    <table>
      <thead><tr><th style="width:6%">N°</th><th style="width:16%">Date</th><th style="width:18%">Résultat</th><th>Mes points forts</th><th>À travailler</th></tr></thead>
      <tbody>${[0, 1, 2, 3, 4, 5].map((i) => { const e = (D.evals ?? [])[i] ?? {}; return `<tr><td class="c">${i + 1}</td><td>${esc(e.date)}</td><td>${esc(e.res)}</td><td>${esc(e.forts)}</td><td>${esc(e.trav)}</td></tr>`; }).join("")}</tbody>
    </table>
  </div>

  <!-- EXAMENS BLANCS -->
  <div class="sec">
    <h2>Mes examens blancs</h2>
    <div style="font-size:8.5pt;color:#475569;margin-bottom:3px">Conditions réelles, scores par épreuve (A2 : 200-299 · B1 : 300-399 · B2 : 400-499).</div>
    <table>
      <thead><tr><th style="width:6%">N°</th><th style="width:16%">Date</th><th class="c">CE /699</th><th class="c">CO /699</th><th class="c">EE /699</th><th class="c">EO /699</th><th>Niveau projeté</th></tr></thead>
      <tbody>${[0, 1, 2, 3, 4].map((i) => { const x = (D.blancs ?? [])[i] ?? {}; return `<tr><td class="c">${i + 1}</td><td>${esc(x.date)}</td><td class="c">${n699(x.ce)}</td><td class="c">${n699(x.co)}</td><td class="c">${n699(x.ee)}</td><td class="c">${n699(x.eo)}</td><td>${esc(x.niv)}</td></tr>`; }).join("")}</tbody>
    </table>
    <div style="font-size:9pt">Remédiation prioritaire : ${box(!!D.remed?.ce)} CE ${box(!!D.remed?.co)} CO ${box(!!D.remed?.ee)} EE ${box(!!D.remed?.eo)} EO &nbsp;·&nbsp; Avant l'examen, je me sens : ${["☹", "😐", "☺", "😀"].map((e, i) => (D.ressenti === i ? `<b>[${e}]</b>` : e)).join(" ")}</div>
  </div>

  <!-- JOUR J -->
  <div class="sec">
    <h2>Mon examen TEF IRN — le jour J</h2>
    <div class="box"><b>Date de l'examen :</b> ${dateFr(D.jourJ?.date) || '<span class="fill">……………</span>'} &nbsp; <b>Heure :</b> ${esc(D.jourJ?.heure) || '<span class="fill">………</span>'}<br>
    Lieu : <b>MYSTORY — 3 bis avenue de Gagny, 93220 Gagny</b> (centre d'examen agréé). Inscription faite par MYSTORY, coût compris dans la formation.</div>
    <table>
      <thead><tr><th>Ma checklist du jour J</th><th style="width:14%" class="c">Fait ✓</th></tr></thead>
      <tbody>
        <tr><td>Pièce d'identité en cours de validité (obligatoire)</td><td class="c">${box(!!D.jourJ?.c1)}</td></tr>
        <tr><td>Ma convocation</td><td class="c">${box(!!D.jourJ?.c2)}</td></tr>
        <tr><td>J'arrive 30 minutes en avance</td><td class="c">${box(!!D.jourJ?.c3)}</td></tr>
        <tr><td>J'ai bien dormi et mangé</td><td class="c">${box(!!D.jourJ?.c4)}</td></tr>
        <tr><td>Je connais le déroulement (1 h 30, 4 épreuves, adaptatif)</td><td class="c">${box(!!D.jourJ?.c5)}</td></tr>
        <tr><td>Je lis bien chaque consigne avant de répondre</td><td class="c">${box(!!D.jourJ?.c6)}</td></tr>
      </tbody>
    </table>
  </div>

  <!-- RÉSULTATS -->
  <div class="sec">
    <h2>Mes résultats officiels</h2>
    <table>
      <thead><tr><th>Épreuve</th><th style="width:24%" class="c">Mon score</th><th style="width:24%" class="c">Niveau atteint</th></tr></thead>
      <tbody>
        <tr><td>Compréhension écrite</td><td class="c">${esc(D.res?.ceS)}</td><td class="c">${esc(D.res?.ceN)}</td></tr>
        <tr><td>Compréhension orale</td><td class="c">${esc(D.res?.coS)}</td><td class="c">${esc(D.res?.coN)}</td></tr>
        <tr><td>Expression écrite</td><td class="c">${esc(D.res?.eeS)}</td><td class="c">${esc(D.res?.eeN)}</td></tr>
        <tr><td>Expression orale</td><td class="c">${esc(D.res?.eoS)}</td><td class="c">${esc(D.res?.eoN)}</td></tr>
        <tr><td><b>Niveau global attesté</b></td><td class="c" colspan="2">${esc(D.res?.global || fiche.niveauAtteint) || '<span class="fill">…………</span>'}</td></tr>
      </tbody>
    </table>
    <div class="box">
      <b>Et maintenant ?</b><br>
      ${box(D.suite === "atteint")} J'ai atteint mon niveau visé — attestation remise à la préfecture 🎉<br>
      ${box(D.suite === "repassage")} Il me manque quelques points — repassage possible après 20 jours (165 €) ou consolidation<br>
      ${box(D.suite === "superieur")} Je continue vers le niveau supérieur — test de positionnement offert<br>
      Bilan de fin de parcours — Date : ${dateFr(D.bilan?.date) || '<span class="fill">………</span>'}${D.bilan?.retiens ? ` · Ce que je retiens : ${esc(D.bilan.retiens)}` : ""} · Signatures : stagiaire <span class="fill">………</span> / MYSTORY <span class="fill">………</span>
    </div>
  </div>

  <div class="foot">MYSTORY — SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017 · NDA 11756521775 (ne vaut pas agrément de l'État) · Certifié Qualiopi · 3 bis av. de Gagny, 93220 Gagny · 06 81 43 16 54 · contact@mystoryformation.fr · « Votre histoire, notre fierté »</div>
</body></html>`;
  return H;
}
