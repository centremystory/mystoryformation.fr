/**
 * MYSTORY — POST /api/commande/paiement  (PUBLIC, appelé par Mollie)
 *
 * Le webhook des COMMANDES composées. Jumeau de `/api/paiements/mollie`, et distinct de
 * lui à dessein : ce dernier cherche la référence du paiement dans
 * `preinscriptions_examen`, où l'identifiant d'une commande n'existe pas. Plutôt que de
 * lui apprendre à chercher à deux endroits — donc de toucher au chemin qui encaisse déjà
 * les inscriptions simples — on lui donne un frère.
 *
 * Les trois principes du webhook Mollie existant valent ici à l'identique, et aucun ne
 * doit sauter :
 *
 * 1. **Le webhook ne transmet QUE l'identifiant**, jamais le statut. On redemande donc
 *    toujours l'état à Mollie. C'est ce qui empêche n'importe qui d'appeler cette URL
 *    pour nous faire croire à un paiement — connaître l'adresse ne suffit pas à se
 *    déclarer payé.
 *
 * 2. **Le montant est vérifié** contre le total de la commande. Un encaissement partiel
 *    ou divergent n'ouvre pas les inscriptions : il alerte.
 *
 * 3. **On répond toujours 200.** Mollie réessaie tant qu'il n'a pas de 200, et un échec
 *    de notre côté ne doit pas déclencher une avalanche de reprises. Ce qui compte est
 *    journalisé ; l'état réel reste chez Mollie, relisible à tout moment.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lirePaiement } from "@/lib/mollie";
import { validerCommandePayee } from "@/lib/commandePaiement";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function journal(evenement: string, id: string | null, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "commandes_en_ligne", entite_id: id, evenement,
      nouvelle_valeur: detail, auteur: "Mollie",
    });
  } catch {
    /* le journal ne doit jamais faire échouer la prise en compte d'un paiement */
  }
}

export async function POST(req: NextRequest) {
  // Mollie envoie un formulaire encodé : id=tr_xxxxx
  let id = "";
  try {
    const brut = await req.text();
    id = new URLSearchParams(brut).get("id")?.trim() ?? "";
    if (!id) {
      const j = JSON.parse(brut || "{}");
      id = String(j?.id ?? "").trim();
    }
  } catch {
    id = "";
  }
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) {
    await journal("mollie_webhook_invalide", null, { recu: id.slice(0, 40) });
    return NextResponse.json({ ok: true });
  }

  let etat;
  try {
    etat = await lirePaiement(id);
  } catch (e) {
    await journal("mollie_relecture_echec", null, {
      paiement: id, erreur: e instanceof Error ? e.message : "inconnue",
    });
    return NextResponse.json({ ok: true });
  }

  const ref = etat.reference;
  if (!ref) {
    await journal("mollie_sans_reference", null, { paiement: id, statut: etat.statut });
    return NextResponse.json({ ok: true });
  }

  if (!etat.paye) {
    await journal("mollie_paiement_non_abouti", ref, { paiement: id, statut: etat.statut });
    return NextResponse.json({ ok: true });
  }

  // Le contrôle du montant, l'idempotence et l'ouverture des pré-inscriptions à la
  // conversion vivent dans `validerCommandePayee` : un seul chemin pour Mollie et Lenbox.
  await validerCommandePayee({
    commandeId: ref,
    moyen: "mollie",
    referencePaiement: id,
    montantRecu: etat.montant,
    auteur: "Mollie",
  });

  return NextResponse.json({ ok: true });
}
