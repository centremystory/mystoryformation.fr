/**
 * MYSTORY — Authentification du portail prescripteur.
 *
 * POST   { action: "connexion",     email, motDePasse }  → ouvre la session
 * POST   { action: "oubli",         email }              → envoie un lien de reinitialisation
 * POST   { action: "reinitialiser", token, nouveau }     → pose le mot de passe
 * DELETE                                                 → ferme la session
 *
 * Le mecanisme est celui de l'equipe (bcrypt + jeton a usage unique, 1 h), mais le
 * cookie et l'audience du JWT sont distincts : une session partenaire n'ouvre
 * jamais le CRM. Voir lib/prescripteurAuth.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";
import { signerSession, optionsCookie, COOKIE_PRESCRIPTEUR } from "@/lib/prescripteurAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MDP_MINIMUM = 10;

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const action = String(b?.action ?? "");
  const ip = ipDe(req);

  // ── Connexion ───────────────────────────────────────────────────────────
  if (action === "connexion") {
    if (await limiteDepassee(`presc-login:${ip}`, 10, 600)) {
      return NextResponse.json(
        { ok: false, erreur: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
    }
    const email = String(b?.email ?? "").trim().toLowerCase();
    const motDePasse = String(b?.motDePasse ?? "");
    if (!email || !motDePasse) {
      return NextResponse.json({ ok: false, erreur: "Adresse et mot de passe requis." }, { status: 400 });
    }
    const { data: p } = await supabaseAdmin
      .from("partenaires")
      .select("id, raison_sociale, email, mot_de_passe_hash, actif, doit_changer_mdp")
      .ilike("email", email).maybeSingle();

    // Message identique que le compte existe ou non : sinon le formulaire devient
    // un moyen de savoir quels organismes travaillent avec nous.
    const refus = NextResponse.json(
      { ok: false, erreur: "Adresse ou mot de passe incorrect." }, { status: 401 });
    if (!p || !p.actif || !p.mot_de_passe_hash) return refus;
    if (!bcrypt.compareSync(motDePasse, p.mot_de_passe_hash)) return refus;

    const jwt = await signerSession({ id: p.id, raison_sociale: p.raison_sociale, email: p.email ?? "" });
    await supabaseAdmin.from("partenaires")
      .update({ derniere_connexion: new Date().toISOString() }).eq("id", p.id);
    await journal("partenaire", p.id, "connexion", null, `partenaire:${p.raison_sociale}`);

    const res = NextResponse.json({ ok: true, doit_changer_mdp: p.doit_changer_mdp });
    res.cookies.set(COOKIE_PRESCRIPTEUR, jwt, optionsCookie());
    return res;
  }

  // ── Mot de passe oublie ─────────────────────────────────────────────────
  if (action === "oubli") {
    if (await limiteDepassee(`presc-oubli:${ip}`, 5, 3600)) {
      return NextResponse.json({ ok: true });   // silencieux : pas d'indice a l'attaquant
    }
    const email = String(b?.email ?? "").trim().toLowerCase();
    const { data: p } = await supabaseAdmin
      .from("partenaires").select("id, raison_sociale, email, actif").ilike("email", email).maybeSingle();

    // Reponse TOUJOURS positive, meme si l'adresse est inconnue : repondre « compte
    // introuvable » revient a publier la liste de nos partenaires.
    if (p && p.actif && p.email) {
      const token = randomUUID();
      await supabaseAdmin.from("partenaires").update({
        reset_token: token,
        reset_token_expire: new Date(Date.now() + 3600_000).toISOString(),
      }).eq("id", p.id);

      const lien = `${req.nextUrl.origin}/prescripteur/mot-de-passe?token=${token}`;
      const env = await envoyerEmail({
        a: p.email,
        objet: "Votre accès partenaire MYSTORY",
        html: gabaritEmail("Votre accès partenaire", `
          <p>Bonjour,</p>
          <p>Vous avez demandé à définir le mot de passe de l'espace partenaire de
             <b>${p.raison_sociale}</b>.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${lien}" style="background:#2F72DE;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Définir mon mot de passe</a>
          </p>
          <p style="font-size:13px;color:#6b7280;">Ou copiez ce lien&nbsp;:<br>${lien}</p>
          <p style="font-size:13px;color:#6b7280;">Ce lien est valable une heure et ne
             fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande,
             ignorez ce message&nbsp;: rien n'a changé.</p>`),
        entite: "partenaire", entiteId: p.id, auteur: "systeme",
      });
      // Un envoi qui echoue en silence laisse le partenaire attendre un courriel qui
      // ne viendra jamais : on le trace, meme si la reponse reste positive.
      if (!env.ok) await journal("partenaire", p.id, "reset_email_echec", { erreur: env.erreur }, null);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Poser le mot de passe ───────────────────────────────────────────────
  if (action === "reinitialiser") {
    const token = String(b?.token ?? "").trim();
    const nouveau = String(b?.nouveau ?? "");
    if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
    if (nouveau.length < MDP_MINIMUM) {
      return NextResponse.json(
        { ok: false, erreur: `Le mot de passe doit faire au moins ${MDP_MINIMUM} caractères.` },
        { status: 400 });
    }
    const { data: p } = await supabaseAdmin
      .from("partenaires").select("id, raison_sociale, email, reset_token_expire, actif")
      .eq("reset_token", token).maybeSingle();
    if (!p || !p.actif || !p.reset_token_expire || new Date(p.reset_token_expire) < new Date()) {
      return NextResponse.json(
        { ok: false, erreur: "Ce lien a expiré. Demandez-en un nouveau." }, { status: 400 });
    }

    await supabaseAdmin.from("partenaires").update({
      mot_de_passe_hash: bcrypt.hashSync(nouveau, 10),
      doit_changer_mdp: false,
      reset_token: null, reset_token_expire: null,   // usage unique
    }).eq("id", p.id);
    await journal("partenaire", p.id, "mot_de_passe_pose", null, `partenaire:${p.raison_sociale}`);

    // On ouvre la session dans la foulee : le partenaire vient de prouver qu'il
    // controle l'adresse, lui redemander de se connecter n'apporte rien.
    const jwt = await signerSession({ id: p.id, raison_sociale: p.raison_sociale, email: p.email ?? "" });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_PRESCRIPTEUR, jwt, optionsCookie());
    return res;
  }

  return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PRESCRIPTEUR, "", optionsCookie(0));
  return res;
}
