/**
 * MYSTORY — Notation formatrice d'un test (expression écrite + orale).
 * GET  : liste des tests en attente de notation (auth pédagogique).
 * POST : { id, ee_sur10, eo_sur10, remarques? } → calcule le niveau /20, finalise, rattache au dossier.
 * Horodatage serveur (anti-antidatage). Niveau = (CE/10 + CO/10 + EE/10 + EO/10) / 2 → A0…B2.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError } from "@/lib/auth";
import { niveauFromSur20 } from "@/lib/tests";
import { genererDocEvaluation } from "@/lib/evaluationDoc";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { conseilTest } from "@/lib/conseilsTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_NOTE = ["direction", "manager", "formatrice", "back_office"] as const;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireRole(req, ROLES_NOTE); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  const { data: evs } = await supabaseAdmin
    .from("evaluations")
    .select("id, phase, test_id, dossier_id, nom, prenom, email, ce_sur10, co_sur10, ecrit, oral_audios, cree_le")
    .eq("statut", "en_attente_formateur")
    .order("cree_le", { ascending: true });

  const testIds = [...new Set((evs ?? []).map((e: any) => e.test_id))];
  const testsMap = new Map<string, any>();
  if (testIds.length) {
    const { data: ts } = await supabaseAdmin.from("tests").select("id, titre, phase, consigne_ecrit, consigne_oral").in("id", testIds);
    (ts ?? []).forEach((t: any) => testsMap.set(t.id, t));
  }
  const evaluations = [];
  for (const e of (evs ?? []) as any[]) {
    const oa = Array.isArray(e.oral_audios) ? e.oral_audios : [];
    const oral: Array<{ q: number; question: string; url: string | null; duree: number | null }> = [];
    for (const a of oa) {
      let url: string | null = null;
      try { const { data: signed } = await supabaseAdmin.storage.from("documents").createSignedUrl(a.chemin, 3600); url = signed?.signedUrl ?? null; } catch { url = null; }
      oral.push({ q: a.q, question: a.question, url, duree: a.duree ?? null });
    }
    evaluations.push({ ...e, test: testsMap.get(e.test_id) ?? null, oral });
  }
  return NextResponse.json({ ok: true, evaluations });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ROLES_NOTE); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "Évaluation manquante." }, { status: 400 });
  const ee = Number(body.ee_sur10), eo = Number(body.eo_sur10);
  if (!(ee >= 0 && ee <= 10) || !(eo >= 0 && eo <= 10)) {
    return NextResponse.json({ ok: false, erreur: "Les notes EE et EO doivent être comprises entre 0 et 10." }, { status: 422 });
  }
  const remarques = body.remarques == null ? null : (String(body.remarques).trim().slice(0, 4000) || null);

  const { data: ev } = await supabaseAdmin
    .from("evaluations").select("id, phase, dossier_id, ce_sur10, co_sur10, statut, civilite, nom, prenom, email, niveau_vise").eq("id", id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Évaluation introuvable." }, { status: 404 });
  if (ev.statut !== "en_attente_formateur") return NextResponse.json({ ok: false, erreur: "Ce test n'est pas en attente de notation." }, { status: 409 });
  if (ev.ce_sur10 == null || ev.co_sur10 == null) return NextResponse.json({ ok: false, erreur: "Scores de compréhension absents." }, { status: 409 });

  const total = Math.round(((Number(ev.ce_sur10) + Number(ev.co_sur10) + ee + eo) / 2) * 10) / 10;
  const niveau = niveauFromSur20(total);

  const { error } = await supabaseAdmin.from("evaluations").update({
    ee_sur10: ee, eo_sur10: eo, remarques, total_sur20: total, niveau_global: niveau,
    statut: "complet", complete_le: new Date().toISOString(), notateur: u.email ?? null,
  }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });

  // Rattachement au dossier : final → niveau atteint ; initial → niveau initial
  if (ev.dossier_id) {
    const champ = ev.phase === "final" ? "niveau_atteint" : "niveau_initial";
    await supabaseAdmin.from("dossiers").update({ [champ]: niveau }).eq("id", ev.dossier_id);

    // Auto : la pièce de conformité « Évaluation » du dossier est générée depuis le test (best-effort).
    if (ev.phase === "initial" || ev.phase === "final") {
      try { await genererDocEvaluation(ev.dossier_id, ev.phase, u.email ?? null); } catch { /* non bloquant */ }
    }
  }

  // Email récap AUTOMATIQUE au candidat (décision Direction 09/07 : envoi auto, zéro oubli).
  // Test initial uniquement : niveau global + détail des 4 épreuves + conseils personnalisés + invitation RDV.
  // Best-effort : un échec d'envoi ne bloque jamais la notation.
  let emailEnvoye = false;
  if (ev.phase === "initial" && ev.email) {
    try {
      const c = conseilTest(niveau, ev.niveau_vise ?? null);
      const ligne = (lbl: string, n: number) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef1f6;">${lbl}</td><td style="padding:6px 10px;border-bottom:1px solid #eef1f6;text-align:right;font-weight:bold;">${n}/10</td></tr>`;
      const corps = `
<p>Bonjour ${ev.civilite ? ev.civilite + " " : ""}${ev.prenom ?? ""} ${ev.nom ?? ""},</p>
<p>Votre test de positionnement en français a été corrigé par notre formatrice. Voici vos résultats :</p>
<div style="text-align:center;margin:14px 0;">
  <span style="display:inline-block;background:#2F72DE;color:#fff;border-radius:12px;padding:10px 26px;font-size:26px;font-weight:bold;">Niveau ${niveau}</span>
  <div style="color:#6b7280;font-size:12px;margin-top:6px;">Note globale : ${total}/20 (échelle CECRL)</div>
</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
${ligne("Compréhension écrite", Number(ev.ce_sur10))}
${ligne("Compréhension orale", Number(ev.co_sur10))}
${ligne("Expression écrite", ee)}
${ligne("Expression orale", eo)}
</table>
<div style="background:#f0f6ff;border:1px solid #d7e6fb;border-radius:10px;padding:12px 14px;margin:16px 0;">
  <div style="font-weight:bold;color:#2F72DE;margin-bottom:4px;">Nos conseils personnalisés</div>
  <div>${c.message}</div>
</div>
<p><strong>Et maintenant ?</strong> Appelez-nous au <strong>06&nbsp;81&nbsp;43&nbsp;16&nbsp;54</strong> ou passez nous voir à Gagny (3&nbsp;bis av. de Gagny, 93220 — lun–sam 9h30–17h30) : un conseiller vous présentera la formule <strong>${c.formule} (${c.heures}&nbsp;h)</strong> et les possibilités de financement (CPF, personnel…).</p>
<p>À très vite,<br>L'équipe MYSTORY Formation</p>`;
      const envoi = await envoyerEmail({
        a: ev.email,
        objet: `Vos résultats — niveau ${niveau} · MYSTORY Formation`,
        html: gabaritEmail("Résultats de votre test de positionnement", corps),
        entite: "evaluations", entiteId: id, auteur: u.email ?? undefined,
      });
      emailEnvoye = !!envoi.ok;
    } catch { /* non bloquant */ }
  }

  await journal("evaluation", id, "test_note", { total_sur20: total, niveau, email_recap_envoye: emailEnvoye }, u.email ?? null);
  return NextResponse.json({ ok: true, niveau, total_sur20: total, email_recap_envoye: emailEnvoye });
}
