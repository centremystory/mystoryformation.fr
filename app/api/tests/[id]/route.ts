/**
 * MYSTORY — Récap complet d'un test de positionnement / final.
 * GET /api/tests/[id] : évaluation entière (scores, écrit, audios signés, remarques),
 * conseils générés (règle métier), dossier + stagiaire rattachés (lien fiche client).
 * Lecture seule, auth équipe (requireUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { conseilTest } from "@/lib/conseilsTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
    throw e;
  }

  const id = String(params.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "Identifiant manquant." }, { status: 400 });

  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, phase, dossier_id, civilite, nom, prenom, email, telephone, adresse, cp, ville, niveau_vise, ce_sur10, co_sur10, ee_sur10, eo_sur10, ecrit, oral_audios, total_sur20, niveau_global, statut, auteur, notateur, remarques, cree_le, complete_le")
    .eq("id", id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });

  // Sujet du test (titre + consignes) — sans les corrigés, qui ne quittent jamais la base.
  let test: any = null;
  if (ev.test_id) {
    const { data: t } = await supabaseAdmin.from("tests").select("id, titre, phase, consigne_ecrit, consigne_oral").eq("id", ev.test_id).maybeSingle();
    test = t ?? null;
  }

  // Audios de l'oral : URLs signées 1 h.
  const oral: Array<{ q: number; question: string; url: string | null; duree: number | null }> = [];
  const oa = Array.isArray(ev.oral_audios) ? ev.oral_audios : [];
  for (const a of oa as any[]) {
    let url: string | null = null;
    try { const { data: s } = await supabaseAdmin.storage.from("documents").createSignedUrl(a.chemin, 3600); url = s?.signedUrl ?? null; } catch { url = null; }
    oral.push({ q: a.q, question: a.question, url, duree: a.duree ?? null });
  }

  // Dossier + stagiaire rattachés (lien vers la fiche client).
  let dossier: any = null, stagiaire: any = null;
  if (ev.dossier_id) {
    const { data: d } = await supabaseAdmin
      .from("dossiers").select("id, stagiaire_id, certif, financement, statut, niveau_initial, niveau_vise, niveau_atteint, date_debut, date_fin")
      .eq("id", ev.dossier_id).maybeSingle();
    dossier = d ?? null;
    if (d?.stagiaire_id) {
      const { data: s } = await supabaseAdmin.from("stagiaires").select("id, nom, prenom").eq("id", d.stagiaire_id).maybeSingle();
      stagiaire = s ?? null;
    }
  }

  // Conseils (règle métier) — seulement si le test est complet.
  const conseil = ev.statut === "complet" && ev.niveau_global
    ? conseilTest(ev.niveau_global, ev.niveau_vise ?? dossier?.niveau_vise ?? null)
    : null;

  const { oral_audios: _oa, ...evSansAudios } = ev as any;
  return NextResponse.json({ ok: true, evaluation: evSansAudios, test, oral, dossier, stagiaire, conseil });
}
