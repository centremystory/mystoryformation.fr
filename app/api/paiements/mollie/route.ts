/**
 * MYSTORY — POST /api/paiements/mollie  (PUBLIC, appelé par Mollie)
 *
 * Mollie prévient ici à chaque changement d'état d'un paiement. Trois principes tiennent
 * la sécurité de cette route, et aucun ne doit sauter :
 *
 * 1. **Le webhook ne transmet QUE l'identifiant**, jamais le statut. On redemande donc
 *    toujours l'état à Mollie. C'est ce qui empêche n'importe qui d'appeler cette URL pour
 *    nous faire croire à un paiement — connaître l'adresse ne suffit pas à se déclarer payé.
 *
 * 2. **Le montant est vérifié** contre celui de la pré-inscription. Un encaissement partiel
 *    ou divergent n'ouvre pas l'inscription : il alerte.
 *
 * 3. **On répond toujours 200.** Mollie réessaie tant qu'il n'a pas de 200, et un échec de
 *    notre côté ne doit pas déclencher une avalanche de reprises. Ce qui compte est
 *    journalisé ; l'état réel reste chez Mollie, relisible à tout moment.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lirePaiement } from "@/lib/mollie";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function journal(evenement: string, entiteId: string | null, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "preinscriptions_examen", entite_id: entiteId,
      evenement, nouvelle_valeur: detail, auteur: "Mollie",
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

  const { data: pre } = await supabaseAdmin
    .from("preinscriptions_examen")
    .select("id, statut, montant, paye_le, candidat_nom, candidat_prenom, candidat_email, type_examen, session_id")
    .eq("id", ref)
    .maybeSingle();

  if (!pre) {
    await journal("mollie_preinscription_introuvable", null, { paiement: id, reference: ref });
    return NextResponse.json({ ok: true });
  }

  // Déjà traité : Mollie rappelle volontiers plusieurs fois le même paiement.
  if ((pre as any).paye_le) return NextResponse.json({ ok: true });

  if (!etat.paye) {
    await journal("mollie_paiement_non_abouti", ref, { paiement: id, statut: etat.statut });
    return NextResponse.json({ ok: true });
  }

  // Le montant encaissé doit correspondre. Un écart n'ouvre pas l'inscription : il alerte.
  const attendu = Number((pre as any).montant);
  if (etat.montant == null || Math.abs(etat.montant - attendu) > 0.01) {
    await journal("mollie_montant_divergent", ref, {
      paiement: id, attendu, recu: etat.montant,
    });
    await envoyerEmail({
      a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
      objet: `Paiement en ligne au mauvais montant — ${(pre as any).candidat_nom} ${(pre as any).candidat_prenom}`,
      html: gabaritEmail(
        "Montant encaissé différent de l'inscription",
        `<p>Un paiement en ligne est arrivé pour un montant qui ne correspond pas à l'inscription.
         <b>L'inscription n'a pas été validée</b> — merci de vérifier avant de convoquer.</p>
         <p>Attendu : <b>${attendu.toFixed(2)} €</b><br>Reçu : <b>${etat.montant ?? "?"} €</b><br>
         Paiement Mollie : ${id}</p>`,
      ),
      entite: "preinscriptions_examen", entiteId: ref,
    });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from("preinscriptions_examen")
    .update({ paye_le: new Date().toISOString(), reference_paiement: id })
    .eq("id", ref)
    .is("paye_le", null); // course : deux appels simultanés n'encaissent qu'une fois

  if (error) {
    await journal("mollie_enregistrement_echec", ref, { paiement: id, erreur: error.message });
    return NextResponse.json({ ok: true });
  }

  await journal("paiement_recu", ref, { paiement: id, montant: etat.montant });

  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: `Inscription en ligne payée — ${(pre as any).candidat_nom} ${(pre as any).candidat_prenom} · ${attendu.toFixed(2)} €`,
    html: gabaritEmail(
      "Inscription en ligne réglée",
      `<p>Un candidat vient de s'inscrire et de régler en ligne.</p>
       <p><b>${(pre as any).candidat_nom} ${(pre as any).candidat_prenom}</b><br>
       ${(pre as any).type_examen === "TEF_IRN" ? "TEF IRN" : "Examen civique"} — ${attendu.toFixed(2)} €<br>
       ${(pre as any).candidat_email}</p>
       <p>Son identité complète est déjà saisie : la pré-inscription est prête à être convertie
       en inscription depuis le CRM.</p>`,
    ),
    entite: "preinscriptions_examen", entiteId: ref,
  });

  return NextResponse.json({ ok: true });
}
