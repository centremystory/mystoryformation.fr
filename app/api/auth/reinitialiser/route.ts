/**
 * MYSTORY — POST /api/auth/reinitialiser  { token, nouveau_mdp }
 * Valide le jeton (non expiré, usage unique), pose le nouveau mot de passe (bcrypt),
 * efface le jeton. Journalisé. Aucune authentification préalable (le jeton fait foi).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));
  const token = String(b?.token ?? "").trim();
  const nouveau = String(b?.nouveau_mdp ?? "");

  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  if (nouveau.length < 8) return NextResponse.json({ ok: false, erreur: "Le mot de passe doit faire au moins 8 caractères." }, { status: 400 });

  const { data: u } = await supabaseAdmin
    .from("utilisateurs")
    .select("id, email, actif, reset_token_expire")
    .eq("reset_token", token)
    .maybeSingle();
  if (!u || !(u as any).actif) return NextResponse.json({ ok: false, erreur: "Lien invalide ou déjà utilisé." }, { status: 400 });
  if (!(u as any).reset_token_expire || new Date((u as any).reset_token_expire).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, erreur: "Lien expiré. Refaites une demande depuis « Mot de passe oublié »." }, { status: 400 });
  }

  const hash = bcrypt.hashSync(nouveau, 10);
  await supabaseAdmin.from("utilisateurs").update({
    mot_de_passe_hash: hash, doit_changer_mdp: false, reset_token: null, reset_token_expire: null,
  }).eq("id", (u as any).id);

  await journal("utilisateur", (u as any).id, "mot_de_passe_reinitialise_self", { email: (u as any).email }, (u as any).email ?? null);
  return NextResponse.json({ ok: true });
}
