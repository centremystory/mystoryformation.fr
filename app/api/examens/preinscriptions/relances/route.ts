/**
 * MYSTORY — /api/examens/preinscriptions/relances  (relance auto J+1)
 * POST — relance les pré-inscriptions « en_attente » créées il y a ≥ 1 jour et jamais relancées
 *   (rappel du lien de paiement), pose relance_le. Puis EXPIRE celles relancées et toujours
 *   impayées après ≥ 3 jours (statut « expiree »). Idempotent.
 * GET — aperçu (combien seraient relancées / expirées) sans rien envoyer.
 * Appelée par un workflow n8n quotidien (Bearer). Auth requireUser (le Bearer JWT passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiParisISO } from "@/lib/dates";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal, dateFR } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const LIBELLE: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique", Vente_plateforme: "Vente plateforme" };

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function auth(req: NextRequest) {
  try { await requireUser(req); return null; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const ko = await auth(req); if (ko) return ko;
  const { data } = await supabaseAdmin.from("preinscriptions_examen").select("id, cree_le, relance_le, statut").eq("statut", "en_attente");
  const aRelancer = (data ?? []).filter((p: any) => !p.relance_le && joursDepuis(p.cree_le) >= 1).length;
  const aExpirer = (data ?? []).filter((p: any) => p.relance_le && joursDepuis(p.cree_le) >= 3).length;
  return NextResponse.json({ ok: true, aRelancer, aExpirer });
}

export async function POST(req: NextRequest) {
  const ko = await auth(req); if (ko) return ko;

  const { data: liste } = await supabaseAdmin
    .from("preinscriptions_examen")
    .select("*, sessions_examen:session_id (date_examen, horaire)")
    .eq("statut", "en_attente");

  let relancees = 0, expirees = 0;
  for (const p of (liste ?? []) as any[]) {
    const age = joursDepuis(p.cree_le);

    // Expiration : relancée et toujours impayée après ≥ 3 jours.
    if (p.relance_le && age >= 3) {
      await supabaseAdmin.from("preinscriptions_examen").update({ statut: "expiree" }).eq("id", p.id);
      await journal("preinscriptions_examen", p.id, "preinscription_expiree", { age }, "preinscription-relance-auto");
      expirees++;
      continue;
    }

    // Relance : en attente depuis ≥ 1 jour, jamais relancée.
    if (!p.relance_le && age >= 1 && p.candidat_email && p.lien_paiement) {
      const libelle = LIBELLE[p.type_examen] ?? "Examen";
      const session = p.sessions_examen ?? null;
      const creneau = session ? `<p>Créneau souhaité : le <strong>${dateFR(session.date_examen)}</strong> (${session.horaire}).</p>` : "";
      const corps = `
        <p>Bonjour ${p.candidat_prenom ?? ""},</p>
        <p>Votre pré-inscription à <strong>${libelle}${p.sous_type ? ` — ${p.sous_type}` : ""}</strong> est toujours <strong>en attente de paiement</strong>.</p>
        ${creneau}
        <p>Pour confirmer votre place, réglez votre examen via ce lien :</p>
        <p style="margin:18px 0"><a href="${p.lien_paiement}" style="background:#2F72DE;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Régler mon examen (${p.montant} €)</a></p>
        <p style="font-size:13px;color:#666">Lien : ${p.lien_paiement}</p>
        <p>⚠️ Sans paiement, votre place pourra être réattribuée.</p>
        <p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
        <p>L'équipe MYSTORY</p>`;
      const env = await envoyerEmail({
        a: p.candidat_email,
        objet: `Rappel — votre pré-inscription ${libelle} (MYSTORY)`,
        html: gabaritEmail("Rappel de paiement", corps),
        entite: "preinscriptions_examen", entiteId: p.id, auteur: "preinscription-relance-auto",
      });
      const maj: Record<string, unknown> = {};
      // On pose la date de relance même si l'email échoue, pour éviter le matraquage (tracé en incident par lib/email).
      maj.relance_le = aujourdhuiParisISO();
      await supabaseAdmin.from("preinscriptions_examen").update(maj).eq("id", p.id);
      await journal("preinscriptions_examen", p.id, "preinscription_relancee", { a: p.candidat_email, envoye: env.ok }, "preinscription-relance-auto");
      relancees++;
    }
  }

  return NextResponse.json({ ok: true, relancees, expirees });
}
