/**
 * MYSTORY — POST /api/auth/mot-de-passe-oublie  { email }
 * Self-service : envoie un lien de réinitialisation à l'utilisateur s'il existe et est actif.
 * Anti-énumération : répond toujours { ok:true } (on ne révèle jamais si l'email existe).
 * Rate-limité par IP. Jeton à usage unique, valable 1 h.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "https://mystoryformation.fr";

export async function POST(req: NextRequest) {
  // Réponse identique quoi qu'il arrive (anti-énumération).
  const reponseOk = NextResponse.json({ ok: true });

  // Rate-limit : 5 demandes / 15 min / IP (silencieux).
  if (await limiteDepassee(`reset:${ipDe(req)}`, 5, 900)) return reponseOk;

  const b = await req.json().catch(() => ({} as any));
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reponseOk;

  const { data: u } = await supabaseAdmin
    .from("utilisateurs")
    .select("id, prenom, nom, email, actif")
    .ilike("email", email)
    .maybeSingle();
  if (!u || !(u as any).actif) return reponseOk;

  const token = randomUUID();
  const expire = new Date(Date.now() + 3600_000).toISOString(); // 1 h
  await supabaseAdmin.from("utilisateurs").update({ reset_token: token, reset_token_expire: expire }).eq("id", (u as any).id);

  const lien = `${APP_URL}/reinitialiser?token=${token}`;
  const corps = `
    <p>Bonjour ${(u as any).prenom ?? ""},</p>
    <p>Vous avez demandé à réinitialiser le mot de passe de votre accès à l'espace MYSTORY.</p>
    <p style="margin:18px 0"><a href="${lien}" style="background:#2F72DE;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Choisir un nouveau mot de passe</a></p>
    <p style="font-size:13px;color:#666">Si le bouton ne fonctionne pas, copiez ce lien : ${lien}</p>
    <p>Ce lien est valable <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>
    <p>L'équipe MYSTORY</p>`;
  await envoyerEmail({
    a: (u as any).email,
    objet: "Réinitialisation de votre mot de passe — MYSTORY",
    html: gabaritEmail("Mot de passe oublié", corps),
    entite: "utilisateurs", entiteId: (u as any).id, auteur: "mot-de-passe-oublie",
  });

  return reponseOk;
}
