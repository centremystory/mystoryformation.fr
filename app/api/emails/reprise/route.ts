// app/api/emails/reprise/route.ts
// Rejoue les e-mails dont les deux tentatives directes ont échoué sur une panne passagère.
//
// 28/09/2026. lib/email.ts réessaie déjà une fois sur l'autre port SMTP (465 ↔ 587).
// Quand les deux échouent — 16 cas en septembre, tous des expirations IONOS — le
// message était perdu : plus rien ne le rejouait. Il est désormais conservé dans
// `emails_en_attente` et cette route le renvoie, appelée par n8n toutes les 10 min.
//
// GET  : état de la file (tout staff connecté), pour voir d'un coup d'œil si ça s'accumule.
// POST : traite les messages dus. Idempotent — deux appels simultanés ne peuvent pas
//        envoyer deux fois le même message (voir le verrou plus bas).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { reenvoyerDepuisFile } from "@/lib/email";
import { requireRole, requireUser, UnauthorizedError, ForbiddenError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Écart avant le prochain essai, en minutes, selon le nombre d'essais déjà faits.
 *  Croissant : inutile de marteler un serveur qui vient de refuser deux fois. */
const ATTENTE_MIN = [10, 30, 120, 360, 720];
/** Au-delà, on abandonne. Un message qui a échoué 6 fois sur 24 h ne relève plus
 *  de l'incident passager : il faut qu'un humain le voie, pas qu'on le rejoue. */
const MAX_ESSAIS = 6;
/** Nombre de messages traités par appel — borné pour tenir dans le temps d'exécution. */
const LOT = 15;

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const { data, error } = await supabaseAdmin
      .from("emails_en_attente")
      .select("id, destinataire, objet, essais, derniere_erreur, prochain_essai, cree_le, envoye_le, abandonne")
      .order("cree_le", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    const liste = data ?? [];
    return NextResponse.json({
      ok: true,
      en_attente: liste.filter((m: any) => !m.envoye_le && !m.abandonne).length,
      abandonnes: liste.filter((m: any) => m.abandonne).length,
      envoyes: liste.filter((m: any) => m.envoye_le).length,
      messages: liste,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // requireRole laisse passer les jetons de service (n8n) depuis le correctif du 25/09.
    await requireRole(req, ["direction"]);

    const maintenant = new Date().toISOString();
    const { data: dus, error } = await supabaseAdmin
      .from("emails_en_attente")
      .select("id, destinataire, copie_cachee, objet, html, pieces_jointes, essais")
      .is("envoye_le", null)
      .eq("abandonne", false)
      .lte("prochain_essai", maintenant)
      .order("cree_le", { ascending: true })
      .limit(LOT);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    if (!dus?.length) return NextResponse.json({ ok: true, traites: 0, envoyes: 0, echecs: 0, abandonnes: 0 });

    let envoyes = 0, echecs = 0, abandonnes = 0;

    for (const m of dus as any[]) {
      // Verrou : on repousse la date AVANT d'envoyer. Si deux appels se croisent,
      // le second ne verra plus ce message comme dû. Et si l'envoi met du temps
      // puis que la fonction est tuée, le message reste en file — au pire il part
      // en retard, jamais deux fois dans la même minute.
      const { data: pris } = await supabaseAdmin
        .from("emails_en_attente")
        .update({ prochain_essai: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq("id", m.id)
        .is("envoye_le", null)
        .eq("abandonne", false)
        .lte("prochain_essai", maintenant)
        .select("id");
      if (!pris?.length) continue; // pris par un autre appel

      const r = await reenvoyerDepuisFile(m);

      if (r.ok) {
        await supabaseAdmin
          .from("emails_en_attente")
          .update({ envoye_le: new Date().toISOString(), derniere_erreur: null })
          .eq("id", m.id);
        await supabaseAdmin.from("journal").insert({
          entite: "email", evenement: "email_renvoye_depuis_file",
          nouvelle_valeur: { a: m.destinataire, objet: m.objet, essais: m.essais + 1 },
        });
        envoyes += 1;
        continue;
      }

      const essais = (m.essais ?? 1) + 1;
      if (essais >= MAX_ESSAIS) {
        await supabaseAdmin
          .from("emails_en_attente")
          .update({ essais, abandonne: true, derniere_erreur: r.erreur ?? null })
          .eq("id", m.id);
        await supabaseAdmin.from("journal").insert({
          entite: "email", evenement: "email_abandonne",
          nouvelle_valeur: { a: m.destinataire, objet: m.objet, essais, erreur: r.erreur ?? null },
        });
        abandonnes += 1;
      } else {
        const minutes = ATTENTE_MIN[Math.min(essais - 1, ATTENTE_MIN.length - 1)];
        await supabaseAdmin
          .from("emails_en_attente")
          .update({
            essais,
            derniere_erreur: r.erreur ?? null,
            prochain_essai: new Date(Date.now() + minutes * 60_000).toISOString(),
          })
          .eq("id", m.id);
        echecs += 1;
      }
    }

    return NextResponse.json({ ok: true, traites: dus.length, envoyes, echecs, abandonnes });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non autorisé" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    }
    return NextResponse.json({ ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" }, { status: 500 });
  }
}
