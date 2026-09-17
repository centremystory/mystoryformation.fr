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
import { niveauLisible } from "@/lib/niveauLisible";

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
    .select("id, token, phase, dossier_id, ce_sur10, co_sur10, statut, civilite, nom, prenom, email, telephone, niveau_vise, niveau_calibre, heures_preconisees")
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
    niveau = "En deçà de A2";
  } else if (Math.min(ee, eo) < SEUIL_EXPRESSION) {
    const rang = PALIERS.indexOf(calibre);
    niveau = rang > 0 ? PALIERS[rang - 1] : "En deçà de A2";
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

  const emailRecapEnvoye = await envoyerRecapCandidat(ev, { id, ee, eo, niveau, total, urlBase: e.urlBase });
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
  ev: any,
  r: { id: string; ee: number; eo: number; niveau: string; total: number; urlBase: string },
): Promise<boolean> {
  if (ev.phase !== "initial" || !ev.email) return false;
  try {
    const c = conseilTest(r.niveau, ev.niveau_vise ?? null);
    const n = niveauLisible(r.niveau);
    const lien = `${r.urlBase.replace(/\/+$/, "")}/pre-inscription${ev.token ? `?t=${encodeURIComponent(ev.token)}` : ""}`;
    const prenom = String(ev.prenom ?? "").trim();

    // Une barre par épreuve : le candidat voit d'un coup d'œil OÙ ça décroche,
    // ce qu'un tableau de chiffres ne montre pas. Tables + styles en ligne :
    // c'est ce que les clients de messagerie savent rendre.
    const epreuves: Array<[string, number]> = [
      ["Compréhension écrite", Number(ev.ce_sur10)],
      ["Compréhension orale", Number(ev.co_sur10)],
      ["Expression écrite", r.ee],
      ["Expression orale", r.eo],
    ];
    const faible = epreuves.reduce((a, b) => (b[1] < a[1] ? b : a));
    const barre = ([nom, note]: [string, number]) => {
      const pct = Math.max(3, Math.round((note / 10) * 100));
      const couleur = note >= 6 ? "#2F72DE" : note >= 4 ? "#D97706" : "#B4462A";
      return `<tr>
  <td style="padding:7px 12px 7px 0;font-size:14px;color:#1f2430;white-space:nowrap;">${nom}</td>
  <td style="padding:7px 0;width:100%;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#EDF1F7;border-radius:5px;">
      <tr><td style="width:${pct}%;background:${couleur};height:9px;border-radius:5px;font-size:0;line-height:0;">&nbsp;</td><td style="font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td>
  <td style="padding:7px 0 7px 12px;font-size:14px;font-weight:700;color:${couleur};white-space:nowrap;">${note}/10</td>
</tr>`;
    };

    // 180 € pour le passage du TEF IRN, inclus, + 40 € par heure. Le CPF prend en
    // charge jusqu'à 1 500 € ; la participation forfaitaire de 150 € reste due
    // quel que soit le volume — c'est ce qui rend le reste à charge constant.
    const prixTotal = 180 + c.heures * 40;
    const partCpf = Math.min(1500, prixTotal - 150);
    const resteACharge = prixTotal - partCpf;
    const eur = (v: number) => (v >= 1000 ? `${Math.floor(v / 1000)} ${String(v % 1000).padStart(3, "0")}` : String(v));

    const corps = `
<p style="font-size:15px;margin:0 0 16px;">Bonjour ${prenom || "à vous"},</p>
<p style="font-size:15px;margin:0 0 20px;">Votre test a été corrigé par notre formatrice. Voici où vous en êtes.</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${n.fond};border:1px solid ${n.bord};border-radius:12px;">
  <tr><td style="padding:18px 20px;">
    <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${n.encre};opacity:.75;">Votre niveau</div>
    <div style="font-size:22px;font-weight:800;color:${n.encre};margin:5px 0 8px;line-height:1.25;">${n.titre}</div>
    <div style="font-size:14px;color:${n.encre};line-height:1.55;">${n.explication}</div>
    <div style="font-size:12px;color:${n.encre};opacity:.7;margin-top:10px;">Référence de l'examen : niveau ${n.code} &nbsp;·&nbsp; note globale ${r.total}/20</div>
  </td></tr>
</table>

<div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#6b7280;margin:24px 0 8px;">Épreuve par épreuve</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
${epreuves.map(barre).join("")}
</table>
<p style="font-size:13px;color:#4a5768;margin:12px 0 0;line-height:1.6;">
  Au TEF IRN, il faut tenir le score <b>dans les quatre épreuves à la fois</b> : une seule
  épreuve faible fait tomber le niveau entier. Pour vous, c'est
  <b>${faible[0].toLowerCase()}</b> qui demande le plus de travail — c'est là que nous
  commencerons.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F7F9FC;border:1px solid #E3E8F2;border-radius:12px;margin:24px 0 0;">
  <tr><td style="padding:18px 20px;">
    <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#2F72DE;">Ce que nous vous proposons</div>
    <div style="font-size:15px;color:#1f2430;line-height:1.6;margin-top:8px;">${c.message}</div>
    <div style="font-size:13px;color:#4a5768;margin-top:10px;line-height:1.6;">
      Le passage du TEF IRN est <b>compris</b> dans le parcours. Le nombre d'heures est arrêté
      avec vous avant toute signature : <b>vous ne financez que les heures retenues</b>.
    </div>
  </td></tr>
</table>

<div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#6b7280;margin:24px 0 8px;">Ce que ça coûte, et comment le financer</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #eef1f6;">Parcours de ${c.heures} h, <b>passage du TEF IRN compris</b></td>
    <td style="padding:9px 0;border-bottom:1px solid #eef1f6;text-align:right;font-weight:700;white-space:nowrap;">${eur(prixTotal)}&nbsp;€</td>
  </tr>
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #eef1f6;color:#4a5768;">Pris en charge par votre CPF</td>
    <td style="padding:9px 0;border-bottom:1px solid #eef1f6;text-align:right;font-weight:700;color:#15663a;white-space:nowrap;">&minus;&nbsp;${eur(partCpf)}&nbsp;€</td>
  </tr>
  <tr>
    <td style="padding:11px 0;"><b>Il vous reste à régler</b></td>
    <td style="padding:11px 0;text-align:right;font-size:20px;font-weight:800;color:#2F72DE;white-space:nowrap;">${eur(resteACharge)}&nbsp;€</td>
  </tr>
</table>
<p style="font-size:13px;color:#4a5768;margin:6px 0 0;line-height:1.6;">
  Ces ${eur(resteACharge)}&nbsp;€ sont la <b>participation obligatoire</b>, identique pour tout le monde et
  quel que soit le nombre d'heures. Et si vous ne passez pas par le CPF, ce parcours se règle
  <b>en 3 ou 4 fois sans frais</b>, ou <b>en 10 fois</b> après étude.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:26px 0 0;">
  <tr><td align="center">
    <a href="${lien}" style="display:inline-block;background:#2F72DE;color:#ffffff;text-decoration:none;padding:16px 38px;border-radius:10px;font-size:17px;font-weight:700;">Je réserve ma place</a>
    <div style="font-size:13px;color:#6b7280;margin-top:10px;">
      Vos informations sont déjà pré-remplies : il ne reste qu'à confirmer.
    </div>
  </td></tr>
</table>

<p style="font-size:15px;color:#1f2430;margin:22px 0 0;line-height:1.65;">
  <b>Ce qui vous sépare de votre objectif est court, et il se travaille.</b> Vous vous entraînerez
  sur les postes qui servent le jour de l'examen, avec un examen blanc complet avant l'épreuve —
  et vous la passerez dans le centre où vous aurez été formé. C'est ce qui fait la différence entre
  réussir du premier coup et attendre 20 jours pour repasser.
</p>
<p style="font-size:14px;color:#4a5768;margin:14px 0 0;line-height:1.6;">
  Vous préférez en parler ? Appelez-nous au <b style="color:#1f2430;">06&nbsp;81&nbsp;43&nbsp;16&nbsp;54</b>.
  La correction commentée de votre rédaction vous est remise lors du rendez-vous.
</p>
<p style="font-size:15px;margin:20px 0 0;">À très vite,<br><b>L'équipe MYSTORY Formation</b></p>`;

    const envoi = await envoyerEmail({
      a: ev.email,
      objet: `${prenom ? prenom + ", v" : "V"}os résultats et le parcours que nous vous conseillons`,
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
      a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
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
