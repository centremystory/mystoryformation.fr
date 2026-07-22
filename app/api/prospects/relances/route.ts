/**
 * MYSTORY — /api/prospects/relances  (nurturing prospect — orchestré par n8n)
 * Un prospect qui a écrit via le site et dont le message reste « nouveau » (non traité)
 * depuis quelques jours reçoit une relance bienveillante avec un pas suivant clair.
 * GET  — liste les prospects éligibles (contrôle).
 * POST — envoie la relance, marque messages_prospects.relance_le (relance unique) et journalise.
 * Éligibilité : statut='nouveau', email présent, message créé il y a ≥ DELAI jours, jamais relancé.
 * Protégé par requireUser (session équipe / Direction, ou Bearer JWT n8n sans rôle).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";
import { getParamNumber } from "@/lib/parametres";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function joursDepuis(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

async function dus() {
  const { data, error } = await supabaseAdmin
    .from("messages_prospects")
    .select("id, nom, email, cree_le, statut, relance_le")
    .eq("statut", "nouveau")
    .is("relance_le", null)
    .not("email", "is", null);
  if (error) throw new Error(error.message);
  const delai = await getParamNumber("prospect_relance_delai_jours", 3); // réglable via /reglages
  return (data ?? [])
    .filter((m: any) => m.email && joursDepuis(m.cree_le) >= delai)
    .map((m: any) => ({ id: m.id, nom: m.nom ?? "", email: m.email }));
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  try { return NextResponse.json({ ok: true, dus: await dus() }); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  let liste;
  try { liste = await dus(); }
  catch (e: any) { return NextResponse.json({ ok: false, erreur: e?.message }, { status: 500 }); }

  const today = aujourdHuiParisISO();
  const resultats: Array<{ email: string; envoye: boolean; erreur?: string }> = [];
  for (const m of liste) {
    const corps = `
      <p>Bonjour ${m.nom ? m.nom.replace(/</g, "&lt;") : ""},</p>
      <p>Vous nous avez contactés il y a quelques jours au sujet de votre projet de formation en français —
      nous voulions nous assurer que vous avez bien toutes les informations utiles.</p>
      <p>Si vous souhaitez avancer, c'est simple :</p>
      <ul>
        <li>répondez à cet email avec vos questions ;</li>
        <li>ou appelez-nous au <strong>06 81 43 16 54</strong> ;</li>
        <li>nous pouvons aussi vous proposer un <strong>test de positionnement gratuit</strong> pour évaluer votre niveau.</li>
      </ul>
      <p>Nous serions ravis de vous accompagner vers votre certification (TEF IRN pour la nationalité / la résidence,
      ou LEVELTEL pour le français professionnel).</p>
      <p>À bientôt,<br>L'équipe MYSTORY Formation</p>`;
    const envoi = await envoyerEmail({
      a: m.email,
      objet: "Votre projet de formation en français — on reste à votre écoute",
      html: gabaritEmail("Toujours là pour vous accompagner", corps),
      entite: "message_prospect", entiteId: m.id, auteur: "nurturing-prospect-auto",
    });
    if (envoi.ok) {
      await supabaseAdmin.from("messages_prospects").update({ relance_le: today }).eq("id", m.id);
      await journal("message_prospect", m.id, "prospect_relance_envoyee", { email: m.email }, "nurturing-prospect-auto");
    }
    resultats.push({ email: m.email, envoye: envoi.ok, erreur: envoi.erreur });
  }
  return NextResponse.json({ ok: true, total: liste.length, envoyees: resultats.filter((r) => r.envoye).length, resultats });
}
