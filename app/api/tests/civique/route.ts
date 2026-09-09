/**
 * Enchaînement vers le test de positionnement de l'examen civique.
 *
 * 09/09/2026 — un candidat qui prépare une carte de séjour, une carte de résident
 * ou une naturalisation doit passer DEUX examens depuis 2026 : le TEF IRN et
 * l'examen civique. Lui proposer le second à la fin du premier, quand il vient de
 * mesurer son niveau, est le moment où il y pense le plus.
 *
 * On repart de son jeton TEF pour recopier son identité : il ne ressaisit rien.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (await limiteDepassee(`tests-civique:${ipDe(req)}`, 10, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as any));
  const token = String(body?.token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Jeton manquant." }, { status: 400 });

  const { data: src } = await supabaseAdmin
    .from("evaluations")
    .select("id, nom, prenom, email, telephone, civilite, demarche, stagiaire_id, auteur")
    .eq("token", token).maybeSingle();
  if (!src) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  const s = src as any;

  const { data: t } = await supabaseAdmin
    .from("tests").select("id").eq("certif", "CIVIQUE").eq("actif", true)
    .order("cree_le", { ascending: false }).limit(1).maybeSingle();
  if (!t) {
    return NextResponse.json({ ok: false, erreur: "Aucun test civique disponible." }, { status: 409 });
  }

  // Un seul test civique par candidat : s'il en a déjà un en cours, on le lui rend.
  const { data: deja } = await supabaseAdmin
    .from("evaluations").select("token")
    .eq("test_id", (t as any).id).eq("statut", "en_cours")
    .eq("email", s.email ?? "").limit(1).maybeSingle();
  if ((deja as any)?.token) {
    return NextResponse.json({ ok: true, url: `/test/${(deja as any).token}`, reprise: true });
  }

  const { data: ev, error } = await supabaseAdmin.from("evaluations").insert({
    test_id: (t as any).id, phase: "initial",
    nom: s.nom, prenom: s.prenom, email: s.email, telephone: s.telephone,
    civilite: s.civilite, demarche: s.demarche, stagiaire_id: s.stagiaire_id,
    statut: "en_cours", auteur: s.auteur ?? "distance",
  }).select("token").maybeSingle();
  if (error || !ev) {
    return NextResponse.json({ ok: false, erreur: "Création impossible." }, { status: 502 });
  }

  await journal("evaluation", s.id, "enchainement_civique",
    { depuis: "test_tef_irn" }, "candidat");
  return NextResponse.json({ ok: true, url: `/test/${(ev as any).token}` });
}
