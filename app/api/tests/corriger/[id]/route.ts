/**
 * MYSTORY — Notation d'un test par LIEN SIGNÉ, sans session.
 *
 * 17/09/2026. Jusqu'ici, corriger l'expression écrite et l'expression orale
 * supposait un compte CRM et un rôle : la formatrice ne pouvait rien faire depuis
 * son téléphone, et les copies dormaient. Le lien signé envoyé dans l'e-mail
 * « Une copie attend sa correction » ouvre directement l'écran de notation.
 *
 * GET  ?c=<signature> → ce qu'il faut pour corriger (SANS aucun corrigé de la banque).
 * POST ?c=<signature> → { ee_sur10, eo_sur10, notateur, … } → même notation que le back-office.
 *
 * Sécurité : la signature est un HMAC de l'identifiant (lib/jetonCorrection), donc
 * indevinable et distincte du jeton de passation que le candidat connaît. Débit limité.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jetonCorrectionValide } from "@/lib/jetonCorrection";
import { noterEvaluation, echecNotation } from "@/lib/noterEvaluation";
import { limiteDepassee, ipDe } from "@/lib/rateLimit";
import { urlDeBase } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le PDF de correction est rendu par Chromium avant l'e-mail interne.
export const maxDuration = 60;

const REFUS = { ok: false, erreur: "Lien de correction invalide ou expiré." };

async function trop(req: NextRequest, suffixe: string): Promise<boolean> {
  return limiteDepassee(`corriger:${suffixe}:${ipDe(req)}`, 30, 300);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (await trop(req, "get")) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives, réessayez dans quelques minutes." }, { status: 429 });
  }
  if (!jetonCorrectionValide(params.id, req.nextUrl.searchParams.get("c"))) {
    return NextResponse.json(REFUS, { status: 403 });
  }

  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, phase, statut, civilite, nom, prenom, niveau_vise, ce_sur10, co_sur10, ee_sur10, eo_sur10, ecrit, sujet_ecrit, oral_audios, oral_evaluation_mode, niveau_calibre, heures_preconisees, cree_le, complete_le, notateur, auteur")
    .eq("id", params.id)
    .maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });

  const { data: t } = await supabaseAdmin
    .from("tests")
    .select("titre, phase, consigne_ecrit, consigne_oral")
    .eq("id", ev.test_id)
    .maybeSingle();

  // Les enregistrements ne sont jamais servis en clair : URL signée, une heure.
  const audios = Array.isArray(ev.oral_audios) ? ev.oral_audios : [];
  const oral: Array<{ q: number; question: string; url: string | null; duree: number | null }> = [];
  for (const a of audios as any[]) {
    let url: string | null = null;
    try {
      const { data: signe } = await supabaseAdmin.storage.from("documents").createSignedUrl(a.chemin, 3600);
      url = signe?.signedUrl ?? null;
    } catch { url = null; }
    oral.push({ q: a.q, question: a.question, url, duree: a.duree ?? null });
  }

  return NextResponse.json({
    ok: true,
    evaluation: {
      id: ev.id,
      phase: ev.phase,
      statut: ev.statut,
      // Déjà notée : l'écran le dit au lieu de laisser saisir une seconde fois.
      deja_notee: ev.statut === "complet",
      candidat: [ev.civilite, ev.prenom, ev.nom].filter(Boolean).join(" ").trim(),
      niveau_vise: ev.niveau_vise,
      sur_place: String(ev.auteur ?? "").startsWith("sur_place"),
      ce_sur10: ev.ce_sur10,
      co_sur10: ev.co_sur10,
      ee_sur10: ev.ee_sur10,
      eo_sur10: ev.eo_sur10,
      niveau_calibre: ev.niveau_calibre,
      heures_preconisees: ev.heures_preconisees,
      ecrit: ev.ecrit,
      sujet_ecrit: ev.sujet_ecrit,
      mots_ecrit: String(ev.ecrit ?? "").trim() ? String(ev.ecrit).trim().split(/\s+/).length : 0,
      oral_evaluation_mode: ev.oral_evaluation_mode,
      notateur: ev.notateur,
      cree_le: ev.cree_le,
      complete_le: ev.complete_le,
      test: t ?? null,
      oral,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (await trop(req, "post")) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives, réessayez dans quelques minutes." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  // La signature peut venir de l'URL ou du corps : l'écran mobile poste en JSON.
  const signature = req.nextUrl.searchParams.get("c") ?? body.c;
  if (!jetonCorrectionValide(params.id, signature)) {
    return NextResponse.json(REFUS, { status: 403 });
  }

  // Qui corrige : la formatrice donne son nom, il part dans le dossier et sur la
  // pièce Qualiopi. Sans session, c'est la seule trace de l'auteur de la notation.
  const notateur = String(body.notateur ?? "").trim().slice(0, 120);
  if (notateur.length < 2) {
    return NextResponse.json({ ok: false, erreur: "Indiquez votre nom avant de valider." }, { status: 422 });
  }

  const r = await noterEvaluation({
    id: params.id,
    ee: Number(body.ee_sur10),
    eo: Number(body.eo_sur10),
    remarques: body.remarques,
    oral_evaluation_mode: body.oral_evaluation_mode,
    oral_level_estimated: body.oral_level_estimated,
    oral_strengths: body.oral_strengths,
    oral_improvement_areas: body.oral_improvement_areas,
    oral_recommendation: body.oral_recommendation,
    oral_examiner_comment: body.oral_examiner_comment,
    notateur,
    urlBase: urlDeBase(req),
  });
  if (echecNotation(r)) return NextResponse.json({ ok: false, erreur: r.erreur }, { status: r.code });
  return NextResponse.json(r);
}
