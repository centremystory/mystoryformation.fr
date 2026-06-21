/**
 * MYSTORY — Kiosque : démarrage d'un test de positionnement (initial) sur place.
 * POST { nom, prenom, email?, telephone? } PUBLIC (rate-limité) → crée l'évaluation initiale et renvoie le lien.
 * Sert l'accueil (prospect qui passe le test sur un poste du bureau).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  try {
    if (await limiteDepassee(`kiosque:${ip}`, 40, 3600)) {
      return NextResponse.json({ ok: false, erreur: "Trop de tests créés depuis ce poste. Réessayez plus tard." }, { status: 429 });
    }
  } catch { /* fail-open : ne jamais bloquer sur une erreur de rate-limit */ }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }
  const nom = String(body.nom ?? "").trim().slice(0, 120);
  const prenom = String(body.prenom ?? "").trim().slice(0, 120);
  const email = body.email ? String(body.email).trim().slice(0, 200) : null;
  const telephone = body.telephone ? String(body.telephone).trim().slice(0, 40) : null;
  const civilite = ["Madame", "Monsieur", "Autre"].includes(String(body.civilite)) ? String(body.civilite) : null;
  const niveau_vise = ["A1", "A2", "B1", "B2"].includes(String(body.niveau_vise)) ? String(body.niveau_vise) : null;
  if (!nom || !prenom) return NextResponse.json({ ok: false, erreur: "Nom et prénom requis." }, { status: 400 });

  const { data: t } = await supabaseAdmin
    .from("tests").select("id").eq("phase", "initial").eq("actif", true)
    .order("cree_le", { ascending: false }).limit(1).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, erreur: "Aucun test de positionnement disponible." }, { status: 409 });

  const { data: ev, error } = await supabaseAdmin.from("evaluations").insert({
    test_id: t.id, phase: "initial", dossier_id: null,
    nom, prenom, email, telephone, civilite, niveau_vise, statut: "en_cours", auteur: "kiosque",
  }).select("id, token").maybeSingle();
  if (error || !ev) return NextResponse.json({ ok: false, erreur: "Création impossible." }, { status: 502 });

  await journal("evaluation", ev.id, "test_cree_kiosque", { nom, prenom }, "kiosque");
  return NextResponse.json({ ok: true, token: ev.token, url: `${req.nextUrl.origin}/test/${ev.token}` });
}
