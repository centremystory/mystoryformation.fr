/**
 * MYSTORY — Notation d'une évaluation (expression écrite + expression orale).
 *
 * Extrait de app/api/tests/notation/route.ts le 17/09/2026. Deux chemins mènent
 * désormais à la même notation :
 *   1. le back-office /tests/a-noter, avec une session d'équipe ;
 *   2. le lien signé reçu par e-mail, que la formatrice ouvre sur son téléphone
 *      sans se connecter (app/tests/corriger/[id]).
 * Une seule implémentation : sinon le niveau retenu, la pièce Qualiopi et l'e-mail
 * candidat finiraient par différer selon l'écran utilisé.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PALIERS, type Palier } from "@/lib/tests";
import { genererDocEvaluation } from "@/lib/evaluationDoc";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { conseilTest } from "@/lib/conseilsTest";
import { construireCorrectionPdf, estEchec } from "@/lib/correctionPdf";

export type EntreeNotation = {
  id: string;
  ee: number;
  eo: number;
  remarques?: unknown;
  oral_evaluation_mode?: unknown;
  oral_level_estimated?: unknown;
  oral_strengths?: unknown;
  oral_improvement_areas?: unknown;
  oral_recommendation?: unknown;
  oral_examiner_comment?: unknown;
  /** Qui note : e-mail de la session, ou nom saisi sur l'écran mobile. */
  notateur: string | null;
  /** Base des liens mis dans les e-mails. */
  urlBase: string;
};

export type ResultatNotation =
  | {
      ok: true;
      niveau: string;
      total_sur20: number;
      email_recap_envoye: boolean;
      satisfaction_chaud_envoyee: boolean;
      correction_interne_envoyee: boolean;
    }
  | { ok: false; erreur: string; code: number };

/**
 * Garde de type pour la branche d'échec — `tsconfig` a `strict: false`, donc
 * TypeScript ne restreint pas une union discriminée par un booléen (voir la note
 * dans lib/facturationPartenaire).
 */
export function echecNotation(r: ResultatNotation): r is Extract<ResultatNotation, { ok: false }> {
  return r.ok === false;
}

/** Seuil, sur 10, en dessous duquel une épreuve d'expression fait tomber le niveau. */
const SEUIL_EXPRESSION = 6;

const clip = (v: unknown, n = 2000) => (v == null ? null : String(v).trim().slice(0, n) || null);

export async function noterEvaluation(e: EntreeNotation): Promise<ResultatNotation> {
  const { id, ee, eo } = e;
  if (!id) return { ok: false, erreur: "Évaluation manquante.", code: 400 };
  if (!(ee >= 0 && ee <= 10) || !(eo >= 0 && eo <= 10)) {
    return { ok: false, erreur: "Les notes EE et EO doivent être comprises entre 0 et 10.", code: 422 };
  }
  const remarques = e.remarques == null ? null : String(e.remarques).trim().slice(0, 4000) || null;

  // Modalité orale explicite (remplace la déduction implicite depuis `auteur`/`oral_audios`).
  // Facultatif : un client plus ancien qui n'envoie rien ne modifie pas la modalité existante.
  const ORAL_MODES = ["remote_recording", "onsite_examiner", "not_required", "pending"];
  const oralModeRaw = String(e.oral_evaluation_mode ?? "").trim();
  const oralMode = ORAL_MODES.includes(oralModeRaw) ? oralModeRaw : null;

  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, phase, dossier_id, ce_sur10, co_sur10, statut, civilite, nom, prenom, email, telephone, niveau_vise, niveau_calibre, heures_preconisees")
    .eq("id", id)
    .maybeSingle();
  if (!ev) return { ok: false, erreur: "Évaluation introuvable.", code: 404 };
  if (ev.statut !== "en_attente_formateur") {
    return { ok: false, erreur: "Ce test n'est pas en attente de notation.", code: 409 };
  }
  if (ev.ce_sur10 == null || ev.co_sur10 == null) {
    return { ok: false, erreur: "Scores de compréhension absents.", code: 409 };
  }

  const total = Math.round(((Number(ev.ce_sur10) + Number(ev.co_sur10) + ee + eo) / 2) * 10) / 10;

  // 09/09/2026 — le niveau n'est plus une moyenne des quatre epreuves.
  //
  // Au TEF IRN, il faut tenir le score DANS LES QUATRE EPREUVES A LA FOIS : une
  // seule epreuve faible fait tomber le niveau entier. Une moyenne donnait donc un
  // resultat que l'examen reel dementirait — un candidat a l'aise a l'oral mais qui
  // n'ecrit pas ressortait « B1 » puis echouait.
  //
  // On part du palier reellement tenu en comprehension (calibrer(), au moment de la
  // soumission), et on l'abaisse d'un cran si une epreuve d'expression ne suit pas.
  // On ne remonte jamais au-dessus : une bonne expression ne compense pas une
  // comprehension insuffisante.
  const calibre = (ev as any).niveau_calibre as Palier | null;
  let niveau: string;
  if (!calibre) {
    niveau = "En deça de A2";
  } else if (Math.min(ee, eo) < SEUIL_EXPRESSION) {
    const rang = PALIERS.indexOf(calibre);
    niveau = rang > 0 ? PALIERS[rang - 1] : "En deça de A2";
  } else {
    niveau = calibre;
  }

  const oralPatch: Record<string, unknown> = {
    oral_score: eo,
    oral_status: oralMode === "not_required" ? "not_applicable" : "evaluated",
    oral_level_estimated: clip(e.oral_level_estimated, 16),
    oral_strengths: clip(e.oral_strengths),
    oral_improvement_areas: clip(e.oral_improvement_areas),
    oral_recommendation: clip(e.oral_recommendation),
    oral_examiner_comment: clip(e.oral_examiner_comment),
    oral_examiner_id: e.notateur,
    oral_evaluated_at: new Date().toISOString(),
  };
  if (oralMode) oralPatch.oral_evaluation_mode = oralMode;

  const { error } = await supabaseAdmin
    .from("evaluations")
    .update({
      ee_sur10: ee, eo_sur10: eo, remarques, total_sur20: total, niveau_global: niveau,
      statut: "complet", complete_le: new Date().toISOString(), notateur: e.notateur,
      ...oralPatch,
    })
    .eq("id", id);
  if (error) return { ok: false, erreur: "Enregistrement impossible.", code: 502 };

  // Rattachement au dossier : final → niveau atteint ; initial → niveau initial
  if (ev.dossier_id) {
    const champ = ev.phase === "final" ? "niveau_atteint" : "niveau_initial";
    const { error: majNiveauErr } = await supabaseAdmin
      .from("dossiers").update({ [champ]: niveau }).eq("id", ev.dossier_id);
    if (majNiveauErr) {
      await journal("dossier", ev.dossier_id, "niveau_maj_echouee",
        { champ, niveau, erreur: majNiveauErr.message }, e.notateur);
    }
    // Auto : la pièce de conformité « Évaluation » du dossier est générée depuis le test.
    if (ev.phase === "initial" || ev.phase === "final") {
      try { await genererDocEvaluation(ev.dossier_id, ev.phase, e.notateur); } catch { /* non bloquant */ }
    }
  }

  const emailRecapEnvoye = await envoyerRecapCandidat(ev, { id, ee, eo, niveau, total });
  const correctionInterneEnvoyee = await envoyerCorrectionInterne(ev, { id, niveau, total, notateur: e.notateur });
  const satisfactionEnvoyee = await envoyerSatisfactionSiFinal(ev, e.urlBase, e.notateur);

  await journal("evaluation", id, "test_note", {
    total_sur20: total, niveau,
    email_recap_envoye: emailRecapEnvoye,
    correction_interne_envoyee: correctionInterneEnvoyee,
    satisfaction_chaud_envoyee: satisfactionEnvoyee,
    notateur: e.notateur,
  }, e.notateur);

  return {
    ok: true, niveau, total_sur20: total,
    email_recap_envoye: emailRecapEnvoye,
    satisfaction_chaud_envoyee: satisfactionEnvoyee,
    correction_interne_envoyee: correctionInterneEnvoyee,
  };
}

/* ─────────────────────────────────────────────────────────────── e-mails */

/** Récap au CANDIDAT — jamais de corrigé : la banque de questions reste interne. */
async function envoyerRecapCandidat(
  ev: any, r: { id: string; ee: number; eo: number; niveau: string; total: number },
): Promise<boolean> {
  if (ev.phase !== "initial" || !ev.email) return false;
  try {
    const c = conseilTest(r.niveau, ev.niveau_vise ?? null);
    const ligne = (lbl: string, n: number) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef1f6;">${lbl}</td><td style="padding:6px 10px;border-bottom:1px solid #eef1f6;text-align:right;font-weight:bold;">${n}/10</td></tr>`;
    const corps = `
<p>Bonjour ${ev.civilite ? ev.civilite + " " : ""}${ev.prenom ?? ""} ${ev.nom ?? ""},</p>
<p>Votre test de positionnement en français a été corrigé par notre formatrice. Voici vos résultats :</p>
<div style="text-align:center;margin:14px 0;">
  <span style="display:inline-block;background:#2F72DE;color:#fff;border-radius:12px;padding:10px 26px;font-size:26px;font-weight:bold;">Niveau ${r.niveau}</span>
  <div style="color:#6b7280;font-size:12px;margin-top:6px;">Note globale : ${r.total}/20 (échelle CECRL)</div>
</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
${ligne("Compréhension écrite", Number(ev.ce_sur10))}
${ligne("Compréhension orale", Number(ev.co_sur10))}
${ligne("Expression écrite", r.ee)}
${ligne("Expression orale", r.eo)}
</table>
<div style="background:#f0f6ff;border:1px solid #d7e6fb;border-radius:10px;padding:12px 14px;margin:16px 0;">
  <div style="font-weight:bold;color:#2F72DE;margin-bottom:4px;">Nos conseils personnalisés</div>
  <div>${c.message}</div>
</div>
<p><strong>Et maintenant ?</strong> Appelez-nous au <strong>06&nbsp;81&nbsp;43&nbsp;16&nbsp;54</strong> : un conseiller vous présentera la formule <strong>${c.formule} (${c.heures}&nbsp;h)</strong> et les possibilités de financement (CPF, personnel…). La correction commentée de votre rédaction vous est remise lors de ce rendez-vous.</p>
<p>À très vite,<br>L'équipe MYSTORY Formation</p>`;
    const envoi = await envoyerEmail({
      a: ev.email,
      objet: `Vos résultats — niveau ${r.niveau} · MYSTORY Formation`,
      html: gabaritEmail("Résultats de votre test de positionnement", corps),
      entite: "evaluations", entiteId: r.id, auteur: "systeme",
    });
    return !!envoi.ok;
  } catch {
    return false;
  }
}

/**
 * Correction détaillée à l'ÉQUIPE, en pièce jointe.
 * 17/09/2026 — le PDF question par question existait depuis juillet, mais il fallait
 * aller le chercher dans le back-office : personne ne l'ouvrait. Il part maintenant
 * tout seul, à la notation, vers la boîte des corrections. Jamais vers le candidat :
 * il contient les corrigés de la banque.
 */
async function envoyerCorrectionInterne(
  ev: any, r: { id: string; niveau: string; total: number; notateur: string | null },
): Promise<boolean> {
  try {
    const pdf = await construireCorrectionPdf(r.id);
    if (estEchec(pdf)) {
      await journal("evaluation", r.id, "correction_pdf_echec", { raison: pdf.erreur }, "systeme");
      return false;
    }
    const nom = [ev.prenom, ev.nom].filter(Boolean).join(" ") || "Candidat sans nom";
    const corps = `
<p style="margin:0 0 14px">La copie de <b>${nom}</b> vient d'être corrigée${r.notateur ? ` par ${r.notateur}` : ""}.</p>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">
  <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Niveau retenu</td><td style="padding:6px 0;font-weight:600">${r.niveau}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Note globale</td><td style="padding:6px 0;font-weight:600">${r.total}/20</td></tr>
  ${ev.telephone ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">Téléphone</td><td style="padding:6px 0;font-weight:600">${ev.telephone}</td></tr>` : ""}
  ${ev.niveau_vise ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">Niveau visé</td><td style="padding:6px 0;font-weight:600">${ev.niveau_vise}</td></tr>` : ""}
</table>
<p style="margin:0 0 6px;font-size:14px"><b>La correction détaillée est en pièce jointe</b> — question par question, avec les bonnes réponses, la rédaction et l'oral.</p>
<p style="margin:0;font-size:13px;color:#b45309"><b>Document interne.</b> Il contient les corrigés de la banque de questions : il se remet en main propre au candidat, il ne se transfère pas par e-mail.</p>`;
    const envoi = await envoyerEmail({
      a: process.env.EMAIL_CORRECTIONS || "contact@mystoryformation.fr",
      objet: `Copie corrigée — ${nom} · niveau ${r.niveau}`,
      html: gabaritEmail("Correction détaillée", corps),
      piecesJointes: [{ nom: pdf.nom, contenu: pdf.contenu }],
      entite: "evaluations", entiteId: r.id, auteur: "systeme",
    });
    return !!envoi.ok;
  } catch {
    return false;
  }
}

/** Enchaînement TEST FINAL : la satisfaction à chaud part dès la notation. */
async function envoyerSatisfactionSiFinal(
  ev: any, urlBase: string, notateur: string | null,
): Promise<boolean> {
  if (ev.phase !== "final" || !ev.dossier_id) return false;
  try {
    const { data: d } = await supabaseAdmin
      .from("dossiers").select("id, token, stagiaires ( civilite, prenom, email )")
      .eq("id", ev.dossier_id).maybeSingle();
    const st: any = (d as any)?.stagiaires;
    if (!d || !st?.email) return false;
    const lien = `${urlBase.replace(/\/+$/, "")}/satisfaction?token=${(d as any).token}&type=chaud`;
    const corpsSat = `
<p>Bonjour ${st.prenom ?? ""},</p>
<p>Votre formation chez MYSTORY touche à sa fin — bravo pour votre parcours ! Votre avis nous aide à progresser et fait partie de notre démarche qualité. Merci de prendre deux minutes :</p>
<p style="text-align:center;margin:24px 0">
  <a href="${lien}" style="background:#2F72DE;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Répondre au questionnaire</a>
</p>
<p style="font-size:13px;color:#667">Si le bouton ne fonctionne pas, copiez ce lien : <br>${lien}</p>
<p>Merci, et belle réussite !<br>L'équipe MYSTORY Formation</p>`;
    const env2 = await envoyerEmail({
      a: st.email, objet: "Votre avis sur la formation",
      html: gabaritEmail("Votre avis sur la formation", corpsSat),
      entite: "dossiers", entiteId: ev.dossier_id, auteur: notateur ?? undefined,
    });
    if (env2.ok) {
      await journal("dossier", ev.dossier_id, "satisfaction_chaud_envoyee", { auto: true, email: st.email }, notateur);
    }
    return !!env2.ok;
  } catch {
    return false;
  }
}
