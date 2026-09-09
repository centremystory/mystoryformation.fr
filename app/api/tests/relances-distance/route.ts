// app/api/tests/relances-distance/route.ts — Tests envoyés à distance, en attente de passation.
// Tests INITIAUX et FINAUX (lien e-mail envoyé, statut en_cours, pas encore passés). Pour la page
// de relance : relancer le lien + garder un commentaire de suivi jusqu'à la conversion.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  // Les DEUX phases (initial + final) : un test final non passé doit aussi pouvoir être relancé.
  const { data, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, civilite, nom, prenom, email, phase, niveau_vise, cree_le, commentaire_suivi, auteur")
    .eq("statut", "en_cours").not("email", "is", null)
    .order("cree_le", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const auj = Date.now();
  const tests = (data ?? []).map((e: any) => ({
    ...e,
    jours: e.cree_le ? Math.floor((auj - new Date(e.cree_le).getTime()) / 86400000) : null,
  }));
  return NextResponse.json({ ok: true, tests, total: tests.length });
}

// Enregistre le commentaire de suivi d'un test à distance (suivi jusqu'à conversion).
export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const commentaire = String(b?.commentaire ?? "").slice(0, 2000);
  const { error } = await supabaseAdmin.from("evaluations").update({ commentaire_suivi: commentaire || null }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("evaluation", id, "test_distance_commentaire", { longueur: commentaire.length }, u.email ?? null);
  return NextResponse.json({ ok: true });
}

// Abandonner un prospect qui ne donne pas suite.
//
// 09/09/2026 — demande d'Arudhan : « il faut qu'on puisse supprimer les prospects
// non interesses aussi sur le crm ». On ARCHIVE plutot que de supprimer : le statut
// « annule » existe deja dans l'interface, il sort la ligne de la liste de relance
// sans effacer la passation. Trois raisons de ne pas supprimer :
//   - un test deja commence contient des reponses, donc une trace de traitement de
//     donnees personnelles qu'il vaut mieux pouvoir justifier ;
//   - un prospect « pas interesse » en septembre rappelle en janvier ;
//   - une suppression est irreversible, un statut se change.
export async function DELETE(req: NextRequest) {
  let u;
  try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const motif = String(b?.motif ?? "").slice(0, 500);

  // On ne peut abandonner qu'un test NON PASSE : un test deja corrige appartient au
  // dossier du stagiaire, on n'y touche pas depuis cet ecran.
  const { data: ev } = await supabaseAdmin
    .from("evaluations").select("id, statut, commentaire_suivi").eq("id", id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  if (ev.statut !== "en_cours") {
    return NextResponse.json(
      { ok: false, erreur: "Ce test a déjà été passé : il ne peut plus être abandonné ici." },
      { status: 409 });
  }

  const trace = [ev.commentaire_suivi, motif ? `Abandonné : ${motif}` : "Abandonné (sans suite)"]
    .filter(Boolean).join(" — ").slice(0, 2000);
  const { error } = await supabaseAdmin
    .from("evaluations").update({ statut: "annule", commentaire_suivi: trace }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("evaluation", id, "test_distance_abandon", { motif: motif || null }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
