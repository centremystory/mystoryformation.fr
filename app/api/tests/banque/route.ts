/**
 * MYSTORY — Éditeur de la banque de tests (modèles initial/final + questions).
 * GET  : liste des tests (+ nb questions) ou ?test_id= pour le détail (test + questions actives).
 * POST { action, ... } : creer | dupliquer | maj_test | maj_question | archiver_question | archiver_test | activer_test.
 * Jamais de DELETE → archivage actif=false. Réservé direction/manager/formatrice.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["direction", "manager", "formatrice"] as const;

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireRole(req, ROLES); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  const testId = req.nextUrl.searchParams.get("test_id");
  if (testId) {
    const { data: test } = await supabaseAdmin.from("tests").select("*").eq("id", testId).maybeSingle();
    if (!test) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
    const { data: questions } = await supabaseAdmin
      .from("test_questions").select("*").eq("test_id", testId).eq("actif", true)
      .order("section", { ascending: true }).order("ordre", { ascending: true });
    return NextResponse.json({ ok: true, test, questions: questions ?? [] });
  }

  const { data: tests } = await supabaseAdmin
    .from("tests").select("id, phase, certif, titre, periode, actif, cree_le")
    .order("phase", { ascending: true }).order("cree_le", { ascending: false });
  const ids = (tests ?? []).map((t: any) => t.id);
  const compte = new Map<string, number>();
  if (ids.length) {
    const { data: qs } = await supabaseAdmin.from("test_questions").select("test_id").eq("actif", true).in("test_id", ids);
    (qs ?? []).forEach((q: any) => compte.set(q.test_id, (compte.get(q.test_id) ?? 0) + 1));
  }
  const liste = (tests ?? []).map((t: any) => ({ ...t, nb_questions: compte.get(t.id) ?? 0 }));
  return NextResponse.json({ ok: true, tests: liste });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ROLES); } catch (e) { const d = deny(e); if (d) return d; throw e; }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }
  const action = String(body.action ?? "");
  const auteur = u.email ?? null;

  if (action === "creer") {
    const phase = body.phase === "final" ? "final" : "initial";
    const titre = String(body.titre ?? "").trim();
    if (!titre) return NextResponse.json({ ok: false, erreur: "Titre requis." }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("tests").insert({
      phase, certif: body.certif ?? "TEF_IRN", titre, periode: body.periode ?? null,
      consigne_ecrit: body.consigne_ecrit ?? null, consigne_oral: body.consigne_oral ?? null, auteur,
    }).select("id").maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, erreur: "Création impossible." }, { status: 502 });
    await journal("test", data.id, "test_cree", { titre, phase }, auteur);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === "dupliquer") {
    const testId = String(body.test_id ?? "");
    const { data: src } = await supabaseAdmin.from("tests").select("*").eq("id", testId).maybeSingle();
    if (!src) return NextResponse.json({ ok: false, erreur: "Test source introuvable." }, { status: 404 });
    const { data: nt, error } = await supabaseAdmin.from("tests").insert({
      phase: src.phase, certif: src.certif, titre: `${src.titre} (copie)`, periode: src.periode,
      consigne_ecrit: src.consigne_ecrit, consigne_oral: src.consigne_oral, auteur,
    }).select("id").maybeSingle();
    if (error || !nt) return NextResponse.json({ ok: false, erreur: "Duplication impossible." }, { status: 502 });
    const { data: qs } = await supabaseAdmin.from("test_questions").select("*").eq("test_id", testId).eq("actif", true);
    if (qs && qs.length) {
      const copies = qs.map((q: any) => ({
        test_id: nt.id, section: q.section, ordre: q.ordre, bloc: q.bloc, type: q.type,
        contexte: q.contexte, audio_path: q.audio_path, enonce: q.enonce, options: q.options,
        bonne_reponse: q.bonne_reponse, mots_cles: q.mots_cles, points: q.points,
      }));
      await supabaseAdmin.from("test_questions").insert(copies);
    }
    await journal("test", nt.id, "test_duplique", { source: testId }, auteur);
    return NextResponse.json({ ok: true, id: nt.id });
  }

  if (action === "maj_test") {
    const testId = String(body.test_id ?? "");
    const patch: Record<string, any> = {};
    for (const k of ["titre", "periode", "consigne_ecrit", "consigne_oral"]) if (k in body) patch[k] = body[k] ?? null;
    if ("oral_questions" in body) patch.oral_questions = Array.isArray(body.oral_questions) ? body.oral_questions.map((x: any) => String(x).trim()).filter(Boolean) : null;
    if ("actif" in body) patch.actif = !!body.actif;
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, erreur: "Rien à modifier." }, { status: 400 });
    const { error } = await supabaseAdmin.from("tests").update(patch).eq("id", testId);
    if (error) return NextResponse.json({ ok: false, erreur: "Mise à jour impossible." }, { status: 502 });
    await journal("test", testId, "test_modifie", patch, auteur);
    return NextResponse.json({ ok: true });
  }

  if (action === "activer_test") {
    const testId = String(body.test_id ?? "");
    const { error } = await supabaseAdmin.from("tests").update({ actif: !!body.actif }).eq("id", testId);
    if (error) return NextResponse.json({ ok: false, erreur: "Impossible." }, { status: 502 });
    await journal("test", testId, body.actif ? "test_active" : "test_archive", null, auteur);
    return NextResponse.json({ ok: true });
  }

  if (action === "archiver_test") {
    const testId = String(body.test_id ?? "");
    const { error } = await supabaseAdmin.from("tests").update({ actif: false }).eq("id", testId);
    if (error) return NextResponse.json({ ok: false, erreur: "Impossible." }, { status: 502 });
    await journal("test", testId, "test_archive", null, auteur);
    return NextResponse.json({ ok: true });
  }

  if (action === "maj_question") {
    const testId = String(body.test_id ?? "");
    const type = body.type === "texte_libre" ? "texte_libre" : "choix_unique";
    const section = body.section === "CO" ? "CO" : "CE";
    const enonce = String(body.enonce ?? "").trim();
    if (!enonce) return NextResponse.json({ ok: false, erreur: "Énoncé requis." }, { status: 400 });
    const options = Array.isArray(body.options) ? body.options : [];
    const mots_cles = Array.isArray(body.mots_cles) ? body.mots_cles.map((m: any) => String(m).trim()).filter(Boolean) : null;
    const bonne_reponse = body.bonne_reponse ? String(body.bonne_reponse).trim() : null;
    if (type === "choix_unique" && !bonne_reponse) return NextResponse.json({ ok: false, erreur: "La bonne réponse est requise pour un choix unique." }, { status: 422 });
    if (type === "texte_libre" && (!mots_cles || !mots_cles.length)) return NextResponse.json({ ok: false, erreur: "Au moins un mot-clé est requis pour une réponse libre." }, { status: 422 });

    const row: Record<string, any> = {
      test_id: testId, section, type, ordre: Number(body.ordre ?? 1) || 1, bloc: body.bloc ?? null,
      contexte: body.contexte ?? null, audio_path: body.audio_path ?? null, enonce,
      options, bonne_reponse: type === "choix_unique" ? bonne_reponse : null,
      mots_cles: type === "texte_libre" ? mots_cles : null, points: Number(body.points ?? 1) || 1,
    };
    const qid = body.question_id ? String(body.question_id) : null;
    if (qid) {
      const { error } = await supabaseAdmin.from("test_questions").update(row).eq("id", qid);
      if (error) return NextResponse.json({ ok: false, erreur: "Mise à jour impossible." }, { status: 502 });
      await journal("test", testId, "question_modifiee", { question_id: qid }, auteur);
      return NextResponse.json({ ok: true, id: qid });
    } else {
      const { data, error } = await supabaseAdmin.from("test_questions").insert(row).select("id").maybeSingle();
      if (error || !data) return NextResponse.json({ ok: false, erreur: "Ajout impossible." }, { status: 502 });
      await journal("test", testId, "question_ajoutee", { question_id: data.id }, auteur);
      return NextResponse.json({ ok: true, id: data.id });
    }
  }

  if (action === "archiver_question") {
    const qid = String(body.question_id ?? "");
    const { error } = await supabaseAdmin.from("test_questions").update({ actif: false }).eq("id", qid);
    if (error) return NextResponse.json({ ok: false, erreur: "Impossible." }, { status: 502 });
    await journal("test", body.test_id ?? null, "question_archivee", { question_id: qid }, auteur);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
}
