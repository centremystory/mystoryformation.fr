/**
 * MYSTORY — /api/contact  (item 14 — messages prospects)
 * POST   (public) { nom?, email?, message, website? } → stocke + notifie Slack + email contact@. (honeypot: website)
 * GET    (équipe) ?statut= → liste les messages.
 * PATCH  (équipe) { id, statut } → traite / archive (pas de suppression).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUTS = ["nouveau", "traite", "archive"];

async function notifierSlack(nom: string, email: string, message: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  const texte = `:speech_balloon: *Nouveau message prospect*\n*De :* ${nom || "—"}${email ? ` (${email})` : ""}\n>${message.replace(/\n/g, "\n>")}`;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texte }) });
  } catch (e) { console.warn("[contact] Slack ignoré:", String(e)); }
}

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  // Anti-spam : 5 envois / 10 min par IP.
  if (await limiteDepassee(`contact:${ipDe(req)}`, 5, 600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de messages envoyés. Réessayez plus tard." }, { status: 429 });
  }

  // Honeypot anti-bot : si « website » est rempli, on fait comme si tout allait bien (sans rien stocker).
  if (String(b?.website ?? "").trim()) return NextResponse.json({ ok: true });

  const message = String(b?.message ?? "").trim();
  const nom = String(b?.nom ?? "").trim();
  const email = String(b?.email ?? "").trim();
  if (message.length < 2) return NextResponse.json({ ok: false, erreur: "Message vide." }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ ok: false, erreur: "Message trop long." }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse email invalide." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages_prospects").insert({ nom: nom || null, email: email || null, message, source: "site" }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Notifications best-effort (n'empêchent jamais l'enregistrement).
  await notifierSlack(nom, email, message);
  try {
    await envoyerEmail({
      a: "contact@mystoryformation.fr",
      objet: `Nouveau message prospect${nom ? ` — ${nom}` : ""}`,
      html: gabaritEmail("Message prospect", `<p><strong>${nom || "—"}</strong>${email ? ` (${email})` : ""}</p><p>${message.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`),
      entite: "message_prospect", entiteId: (data as any).id, auteur: "formulaire-contact",
    });
  } catch (e) { console.warn("[contact] email ignoré:", String(e)); }

  // Accusé de réception au prospect (best-effort, si email fourni).
  if (email) {
    try {
      await envoyerEmail({
        a: email,
        objet: "Nous avons bien reçu votre message — MYSTORY",
        html: gabaritEmail("Message bien reçu", `
          <p>Bonjour${nom ? " " + nom.replace(/</g, "&lt;") : ""},</p>
          <p>Merci de nous avoir contactés. Nous avons bien reçu votre message et notre équipe vous répondra dans les meilleurs délais.</p>
          <p>À très bientôt,<br>L'équipe MYSTORY Formation</p>`),
        entite: "message_prospect", entiteId: (data as any).id, auteur: "accuse-reception",
      });
    } catch (e) { console.warn("[contact] accusé ignoré:", String(e)); }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const statut = req.nextUrl.searchParams.get("statut");
  let q = supabaseAdmin.from("messages_prospects").select("*").order("cree_le", { ascending: false }).limit(200);
  if (statut && STATUTS.includes(statut)) q = q.eq("statut", statut);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((m: any) => m.assignee).filter(Boolean))];
  let map = new Map<string, any>();
  if (ids.length) {
    const { data: us } = await supabaseAdmin.from("utilisateurs").select("id, nom, prenom, email").in("id", ids);
    map = new Map((us ?? []).map((u: any) => [u.id, u]));
  }
  const messages = rows.map((m: any) => {
    const u = m.assignee ? map.get(m.assignee) : null;
    return { ...m, assignee_nom: u ? `${u.prenom ? u.prenom + " " : ""}${u.nom}` : null, assignee_email: u?.email ?? null };
  });
  return NextResponse.json({ ok: true, messages });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const patch: Record<string, any> = {};
  if (b?.statut !== undefined) {
    const statut = String(b.statut).trim();
    if (!STATUTS.includes(statut)) return NextResponse.json({ ok: false, erreur: "statut invalide." }, { status: 400 });
    patch.statut = statut;
  }
  if (b?.assignee !== undefined) {
    patch.assignee = b.assignee ? String(b.assignee).trim() : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour (statut ou assignee)." }, { status: 400 });
  const { error } = await supabaseAdmin.from("messages_prospects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("message_prospect", id, "message_prospect_maj", patch, u.email ?? null);
  return NextResponse.json({ ok: true });
}
