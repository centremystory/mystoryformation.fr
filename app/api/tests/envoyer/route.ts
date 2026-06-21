/**
 * MYSTORY — Envoi du lien de test au candidat par e-mail (SMTP).
 * POST { id, email? } → récupère l'adresse (saisie, évaluation, ou dossier) et envoie le lien.
 * Réservé au back-office (auth requise).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) { if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 }); throw e; }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  const emailManuel = body.email ? String(body.email).trim() : null;
  if (!id) return NextResponse.json({ ok: false, erreur: "Évaluation manquante." }, { status: 400 });

  const { data: ev } = await supabaseAdmin
    .from("evaluations").select("id, token, phase, dossier_id, prenom, email").eq("id", id).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Évaluation introuvable." }, { status: 404 });

  let email = emailManuel || ev.email;
  if (!email && ev.dossier_id) {
    const { data: d } = await supabaseAdmin.from("dossiers").select("stagiaires:stagiaire_id(email)").eq("id", ev.dossier_id).maybeSingle();
    const s: any = d?.stagiaires; const st = Array.isArray(s) ? s[0] : s; email = st?.email ?? null;
  }
  if (!email) return NextResponse.json({ ok: false, erreur: "Aucune adresse e-mail pour ce candidat." }, { status: 409 });

  const url = `${req.nextUrl.origin}/test/${ev.token}`;
  const prenom = ev.prenom ? ` ${ev.prenom}` : "";
  const corps = `<p>Bonjour${prenom},</p>
    <p>Voici votre lien pour passer votre test de français${ev.phase === "final" ? " (test final)" : " de positionnement"} :</p>
    <p style="text-align:center;margin:24px 0;"><a href="${url}" style="background:#2F72DE;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Commencer le test</a></p>
    <p style="font-size:13px;color:#6b7280;">Ou copiez ce lien dans votre navigateur :<br>${url}</p>
    <p>Le test se corrige automatiquement ; une formatrice évaluera ensuite votre expression écrite et orale.</p>`;
  const html = gabaritEmail("Votre test de français", corps);

  const r = await envoyerEmail({ a: email, objet: "Votre test de français — MYSTORY Formation", html, entite: "evaluation", entiteId: ev.id });
  if (!r.ok) return NextResponse.json({ ok: false, erreur: r.erreur || "Envoi impossible." }, { status: 502 });

  await journal("evaluation", ev.id, "test_envoye_mail", { email }, u.email ?? null);
  return NextResponse.json({ ok: true, email });
}
