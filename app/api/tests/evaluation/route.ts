/**
 * MYSTORY — Création d'un lien de test (évaluation) pour un candidat.
 * POST { dossier_id?, phase: 'initial'|'final', test_id? } → crée l'évaluation et renvoie le jeton + l'URL.
 * Réservé au back-office (auth requise). Le test pris par défaut = dernier test actif de la phase.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  const phase = body.phase === "final" ? "final" : "initial";
  const dossier_id = body.dossier_id ? String(body.dossier_id) : null;
  let test_id = body.test_id ? String(body.test_id) : null;

  // Test par défaut : le plus récent actif de la phase demandée
  if (!test_id) {
    const { data: t } = await supabaseAdmin
      .from("tests").select("id").eq("phase", phase).eq("actif", true)
      .order("cree_le", { ascending: false }).limit(1).maybeSingle();
    if (!t) return NextResponse.json({ ok: false, erreur: `Aucun test ${phase} actif dans la banque.` }, { status: 409 });
    test_id = t.id;
  }

  // Pré-remplir l'identité depuis le dossier (pour le test final)
  let identite: { nom: string | null; prenom: string | null; email: string | null } = { nom: null, prenom: null, email: null };
  if (dossier_id) {
    const { data: d } = await supabaseAdmin
      .from("dossiers").select("stagiaires:stagiaire_id(nom, prenom, email)").eq("id", dossier_id).maybeSingle();
    const s: any = d?.stagiaires;
    const st = Array.isArray(s) ? s[0] : s;
    if (st) identite = { nom: st.nom ?? null, prenom: st.prenom ?? null, email: st.email ?? null };
  }

  const { data: ev, error } = await supabaseAdmin.from("evaluations").insert({
    test_id, phase, dossier_id,
    nom: identite.nom, prenom: identite.prenom, email: identite.email,
    statut: "en_cours", auteur: u.email ?? null,
  }).select("id, token").maybeSingle();
  if (error || !ev) return NextResponse.json({ ok: false, erreur: "Création impossible." }, { status: 502 });

  await journal("evaluation", ev.id, "test_cree", { phase, dossier_id }, u.email ?? null);

  const origin = req.nextUrl.origin;
  const url = `${origin}/test/${ev.token}`;
  let qr: string | null = null;
  try { qr = await QRCode.toDataURL(url, { width: 220, margin: 1 }); } catch { qr = null; }
  return NextResponse.json({ ok: true, id: ev.id, token: ev.token, url, qr });
}
