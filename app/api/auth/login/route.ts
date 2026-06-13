import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * MYSTORY — Connexion (v3, comptes individuels + filet équipe).
 * POST { email?, motDePasse } :
 *  - email fourni → connexion individuelle (vérif bcrypt sur public.utilisateurs actifs) ;
 *    le JWT porte l'identité (sub=id, email, role) → traçabilité « qui a fait quoi ».
 *  - email vide   → FILET : mot de passe d'équipe (ACCESS_PASSWORD) → JWT role "staff"
 *    (accès complet, le temps que chacun ait son compte). À retirer plus tard.
 *
 * Env : AUTH_SECRET (signature JWT), ACCESS_PASSWORD (filet équipe), AUTH_COOKIE (défaut mystory_session).
 */
export const runtime = "nodejs";

const COOKIE_NAME = process.env.AUTH_COOKIE ?? "mystory_session";
const TRENTE_JOURS = 60 * 60 * 24 * 30;

function poseCookie(res: NextResponse, jwt: string) {
  res.cookies.set(COOKIE_NAME, jwt, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TRENTE_JOURS });
  return res;
}

export async function POST(req: Request) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json({ erreur: "Configuration serveur incomplète (AUTH_SECRET)." }, { status: 500 });
  }
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

  const corps = await req.json().catch(() => ({} as { email?: string; motDePasse?: string }));
  const email = typeof corps?.email === "string" ? corps.email.trim() : "";
  const motDePasse = typeof corps?.motDePasse === "string" ? corps.motDePasse : "";
  if (!motDePasse) return NextResponse.json({ erreur: "Mot de passe requis." }, { status: 400 });

  // 1) Connexion individuelle
  if (email) {
    const { data: u, error } = await supabaseAdmin
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, mot_de_passe_hash, actif, doit_changer_mdp")
      .ilike("email", email)
      .maybeSingle();
    if (error) return NextResponse.json({ erreur: "Erreur serveur." }, { status: 500 });
    if (!u || !u.actif || !bcrypt.compareSync(motDePasse, u.mot_de_passe_hash)) {
      return NextResponse.json({ erreur: "Identifiants incorrects." }, { status: 401 });
    }
    await supabaseAdmin.from("utilisateurs").update({ derniere_connexion: new Date().toISOString() }).eq("id", u.id);

    const jwt = await new SignJWT({ email: u.email, role: u.role, nom: `${u.prenom ?? ""} ${u.nom}`.trim() })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(u.id)
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    return poseCookie(NextResponse.json({ ok: true, doitChangerMdp: u.doit_changer_mdp, role: u.role }), jwt);
  }

  // 2) Filet : mot de passe d'équipe
  if (!process.env.ACCESS_PASSWORD) {
    return NextResponse.json({ erreur: "Accès équipe non configuré (ACCESS_PASSWORD)." }, { status: 500 });
  }
  if (motDePasse !== process.env.ACCESS_PASSWORD) {
    return NextResponse.json({ erreur: "Mot de passe incorrect." }, { status: 401 });
  }
  const jwt = await new SignJWT({ role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("equipe-mystory")
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  return poseCookie(NextResponse.json({ ok: true, equipe: true }), jwt);
}
