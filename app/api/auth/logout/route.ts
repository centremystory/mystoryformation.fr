// app/api/auth/logout/route.ts — Déconnexion de l'équipe
// Efface le cookie de session (même nom que dans lib/auth.ts : env AUTH_COOKIE,
// défaut mystory_session). Le middleware redirigera ensuite vers /connexion.
import { NextResponse } from "next/server";

const AUTH_COOKIE = process.env.AUTH_COOKIE ?? "mystory_session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // expiration immédiate
  });
  return res;
}
