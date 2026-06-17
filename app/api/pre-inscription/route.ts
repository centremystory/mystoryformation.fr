/**
 * MYSTORY — POST /api/pre-inscription  (public, point 14)
 * Une demande de PRÉ-INSCRIPTION en ligne (prospect) : on stocke une demande structurée dans
 * `messages_prospects` (source = "pre-inscription"). On NE crée PAS de dossier : l'équipe qualifie
 * la demande puis réalise la vraie inscription (le dossier entre alors dans le tunnel à
 * `devis_demande`). Conforme : pas de création automatique de dossier CPF, qualification humaine.
 * Anti-spam : honeypot `website` + rate-limit IP. Aucune donnée sensible exposée.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CERTIFS: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL", indecis: "À déterminer" };
const FINANCEMENTS: Record<string, string> = {
  CPF: "CPF", Perso: "Fonds propres", OPCO: "OPCO", FranceTravail: "France Travail", indecis: "À déterminer",
};
const NIVEAUX: Record<string, string> = {
  debutant: "Débutant", A1: "A1", A2: "A2", B1: "B1", B2: "B2", indecis: "Je ne sais pas",
};

async function notifierSlack(texte: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texte }) });
  } catch (e) { console.warn("[pre-inscription] Slack ignoré:", String(e)); }
}

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  // Anti-spam : 5 demandes / 10 min par IP.
  if (await limiteDepassee(`preinscription:${ipDe(req)}`, 5, 600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de demandes envoyées. Réessayez plus tard." }, { status: 429 });
  }
  // Honeypot anti-bot.
  if (String(b?.website ?? "").trim()) return NextResponse.json({ ok: true });

  const prenom = String(b?.prenom ?? "").trim();
  const nom = String(b?.nom ?? "").trim();
  const email = String(b?.email ?? "").trim();
  const telephone = String(b?.telephone ?? "").trim();
  const certif = CERTIFS[String(b?.certif ?? "")] ?? "À déterminer";
  const financement = FINANCEMENTS[String(b?.financement ?? "")] ?? "À déterminer";
  const niveau = NIVEAUX[String(b?.niveau ?? "")] ?? "Je ne sais pas";
  const dispo = String(b?.message ?? "").trim().slice(0, 2000);

  if (!prenom && !nom) return NextResponse.json({ ok: false, erreur: "Nom requis." }, { status: 400 });
  if (!email && !telephone) return NextResponse.json({ ok: false, erreur: "Un email ou un téléphone est requis pour vous recontacter." }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse email invalide." }, { status: 400 });
  }

  const nomComplet = `${prenom} ${nom}`.trim();
  const message =
    `Demande de pré-inscription en ligne.\n` +
    `• Certification souhaitée : ${certif}\n` +
    `• Financement envisagé : ${financement}\n` +
    `• Niveau actuel estimé : ${niveau}\n` +
    `• Téléphone : ${telephone || "—"}\n` +
    (dispo ? `• Disponibilités / message : ${dispo}` : `• Disponibilités / message : —`);

  const { data, error } = await supabaseAdmin
    .from("messages_prospects")
    .insert({ nom: nomComplet || null, email: email || null, message, source: "pre-inscription" })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Notifications best-effort (n'empêchent jamais l'enregistrement).
  await notifierSlack(`:memo: *Nouvelle pré-inscription*\n*De :* ${nomComplet || "—"}${email ? ` (${email})` : ""}${telephone ? ` · ${telephone}` : ""}\n*Certif :* ${certif} · *Financement :* ${financement} · *Niveau :* ${niveau}`);
  const esc = (s: string) => s.replace(/</g, "&lt;").replace(/\n/g, "<br>");
  try {
    await envoyerEmail({
      a: "contact@mystoryformation.fr",
      objet: `Nouvelle pré-inscription — ${nomComplet || "prospect"} · ${certif}`,
      html: gabaritEmail("Pré-inscription en ligne", `<p><strong>${esc(nomComplet) || "—"}</strong>${email ? ` (${esc(email)})` : ""}${telephone ? ` · ${esc(telephone)}` : ""}</p><p>${esc(message)}</p><p style="color:#6b7280">À qualifier puis transformer en inscription depuis le CRM.</p>`),
      entite: "message_prospect", entiteId: (data as any).id, auteur: "formulaire-preinscription",
    });
  } catch (e) { console.warn("[pre-inscription] email ignoré:", String(e)); }

  await journal("message_prospect", (data as any).id, "pre_inscription_recue", { certif, financement, niveau }, "public");
  return NextResponse.json({ ok: true });
}
