/**
 * MYSTORY — POST /api/paiements/lenbox  (PUBLIC, appelé par Lenbox)
 *
 * 09/10/2026. Lenbox est EN PRODUCTION — deux dossiers financés le 07/10 — mais rien ne
 * reliait ses décisions au CRM : le champ « URL de webhook » du tableau de bord était
 * vide, l'historique des webhooks aussi, et les deux dossiers du 07/10 ont été saisis à
 * la main. Cette route est le récepteur qui manquait.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║ 🔴 LA RÈGLE DE SÉCURITÉ, NON NÉGOCIABLE                                       ║
 * ║                                                                               ║
 * ║ La documentation Lenbox ne décrit AUCUNE signature de webhook : ni HMAC, ni    ║
 * ║ secret partagé, ni liste d'adresses IP. C'est vérifié — la documentation       ║
 * ║ technique a été lue intégralement le 09/10/2026.                              ║
 * ║                                                                               ║
 * ║ Conséquence : quiconque connaît cette URL peut POSTer `status: FINANCED` et,   ║
 * ║ si on le croyait, faire valider une inscription jamais payée. Un examen        ║
 * ║ gratuit pour qui lit une URL dans un courriel.                                ║
 * ║                                                                               ║
 * ║ Donc ce récepteur NE CROIT JAMAIS LE CORPS DU POST. Il s'en sert uniquement    ║
 * ║ comme d'un SIGNAL : « va regarder le dossier X ». Puis il RELIT le statut      ║
 * ║ auprès de l'API Lenbox, avec nos propres identifiants, et ne valide que sur    ║
 * ║ cette relecture.                                                              ║
 * ║                                                                               ║
 * ║ Si la relecture échoue, on NE VALIDE RIEN et on alerte un humain. Jamais de    ║
 * ║ repli sur le corps du webhook : un repli « au cas où » annulerait toute la     ║
 * ║ protection, puisque c'est précisément le cas qu'un attaquant provoquerait.     ║
 * ║                                                                               ║
 * ║ ⟹ LA PHRASE QUI TIENT TOUT :                                                  ║
 * ║   « Tout ce qui vient du corps du webhook ne sert qu'à UNE chose : savoir      ║
 * ║     QUEL DOSSIER ALLER RELIRE. Rien d'autre. »                                ║
 * ║                                                                               ║
 * ║ Donc : aucun `?? valeurDuWebhook` nulle part. Pas pour la référence de la     ║
 * ║ commande, pas pour le statut, pas pour le montant, pas pour la clé            ║
 * ║ d'idempotence. Un repli sur une valeur qu'un tiers choisit annule la           ║
 * ║ relecture : il suffirait alors de POSTer la référence de son choix pour faire  ║
 * ║ valider une commande non payée, et la relecture ne servirait plus à rien.      ║
 * ║                                                                               ║
 * ║ C'est le modèle de Mollie, et c'est volontaire de leur part : leur webhook ne  ║
 * ║ transmet QUE l'identifiant, jamais le statut (cf. lib/mollie.ts). Lenbox n'a   ║
 * ║ pas cette discipline — c'est à nous de l'imposer de notre côté.                ║
 * ║                                                                               ║
 * ║ C'est délibéré, ce n'est pas un détour qu'on aurait pu éviter. Le prochain     ║
 * ║ développeur qui trouvera ça lourd et « simplifiera » en lisant `status` dans   ║
 * ║ le corps ouvrira la caisse : qu'il lise ces lignes d'abord.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Comme pour Mollie, **on répond toujours 200** : un prestataire qui n'obtient pas 200
 * réessaie, et nos erreurs ne doivent pas déclencher une avalanche de reprises. Ce qui
 * compte est journalisé, et l'état réel reste chez Lenbox, relisible à tout moment.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import {
  lireDossierLenbox, lireSessionLenbox, lireNotificationLenbox, lenboxEnTest,
  type DossierLenbox,
} from "@/lib/lenbox";
import { validerCommandePayee } from "@/lib/commandePaiement";
import { ech, enTete } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function journal(evenement: string, id: string | null, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "commandes_en_ligne", entite_id: id, evenement,
      nouvelle_valeur: detail, auteur: "Lenbox",
    });
  } catch {
    /* le journal ne doit jamais faire échouer la prise en compte d'un paiement */
  }
}

/**
 * Trace brute de la notification, et idempotence.
 *
 * `webhook_events.event_key` est unique : si Lenbox renvoie deux fois le même
 * couple dossier/statut, la seconde insertion échoue et on sait qu'on a déjà vu passer
 * l'événement. C'est le même mécanisme que pour DocuSeal, et ça évite d'inventer une
 * table de plus. On garde le corps complet : le jour où Lenbox changera de format, c'est
 * là qu'on le verra.
 *
 * ⚠️ La clé est bâtie sur le statut RELU chez Lenbox, et l'appel se fait APRÈS la
 * relecture. Si on la bâtissait sur le statut annoncé dans le corps, un tiers pourrait
 * choisir la clé — donc occuper d'avance celle d'un vrai financement et faire taire la
 * notification qui compte. Une protection anti-doublon pilotée par l'attaquant devient
 * une arme contre nous.
 */
async function dejaVu(cle: string, type: string, corps: unknown): Promise<boolean> {
  const { error } = await supabaseAdmin.from("webhook_events").insert({
    event_key: cle, event_type: type, payload: corps as any,
  });
  // 23505 = clé déjà présente : cet événement a déjà été traité.
  return !!error && (error as any).code === "23505";
}

/** Prévient un humain quand la machine ne peut pas conclure seule. */
async function alerter(objet: string, corpsHtml: string, id: string | null) {
  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: enTete(objet),
    html: gabaritEmail(objet, corpsHtml),
    entite: "commandes_en_ligne",
    entiteId: id ?? undefined,
  });
}

export async function POST(req: NextRequest) {
  let corps: any = null;
  try {
    const brut = await req.text();
    corps = JSON.parse(brut || "{}");
  } catch {
    corps = null;
  }
  if (!corps || typeof corps !== "object") {
    await journal("lenbox_webhook_illisible", null, {});
    return NextResponse.json({ ok: true });
  }

  /* Deux formats de notification circulent (enveloppé et plat) : on accepte les deux
     plutôt que de parier sur celui qui arrivera. Ces valeurs ne sont PAS des faits —
     seul l'identifiant du dossier sert, et seulement pour aller le relire. */
  const sig = lireNotificationLenbox(corps);

  /* L'identifiant est validé DÈS L'ENTRÉE, avant tout usage.
     Le schéma OpenAPI dit `demande_id: string, format uuid` : on exige donc un UUID,
     ni plus ni moins. Un identifiant qui ne ressemble pas à un identifiant n'est pas
     un identifiant — et le refuser ici évite d'avoir à s'en méfier dans dix endroits
     (chemin d'URL, clé d'idempotence, journal, corps d'e-mail). C'est plus sûr que
     d'échapper partout : la valeur hostile n'entre jamais. */
  const dossierId = String(sig.dossierId ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossierId)) {
    await journal("lenbox_identifiant_invalide", null, {
      // tronqué : on garde de quoi diagnostiquer, pas de quoi recopier n'importe quoi
      recu: dossierId.slice(0, 40),
    });
    return NextResponse.json({ ok: true });
  }

  // ── LA RELECTURE. Tout se joue ici. ──────────────────────────────────────────
  let dossier: DossierLenbox;
  try {
    dossier = await lireDossierLenbox(dossierId);
  } catch (e) {
    const motif = e instanceof Error ? e.message : "inconnue";
    await journal("lenbox_relecture_echec", null, {
      dossier: dossierId, erreur: motif,
      annonce_non_verifiee: sig.statutAnnonce, reference_non_verifiee: sig.reference,
    });
    /* On ne valide RIEN. Le corps du webhook annonce peut-être « FINANCED », mais il
       n'est pas signé : le croire ici reviendrait à encaisser sur parole. Un humain
       tranche, en ouvrant le tableau de bord Lenbox. */
    await alerter(
      `Notification Lenbox non vérifiable — dossier ${dossierId}`,
      `<p>Une notification Lenbox est arrivée, mais <b>la relecture du dossier a échoué</b> :
       le statut n'a donc pas pu être confirmé à la source.</p>
       <p><b>Rien n'a été validé</b> — c'est volontaire : la notification n'est pas signée,
       nous ne la croyons jamais sur parole.</p>
       <p>Dossier Lenbox : <b>${ech(dossierId)}</b><br>
       Statut annoncé (NON vérifié) : ${ech(sig.statutAnnonce ?? "?")}<br>
       Commande annoncée (NON vérifiée) : ${ech(sig.reference ?? "inconnue")}<br>
       Erreur de relecture : ${ech(motif)}</p>
       <p>👉 Vérifiez le dossier dans le tableau de bord Lenbox. S'il est bien financé,
       validez la commande depuis le CRM.</p>`,
      null,
    );
    return NextResponse.json({ ok: true });
  }

  // Doublon ? La clé ne tient QUE des valeurs relues chez Lenbox.
  if (await dejaVu(`lenbox:${dossier.id}:${dossier.statut}`, "lenbox", corps)) {
    return NextResponse.json({ ok: true });
  }

  // Un dossier de test ne doit jamais valider une inscription en production.
  if (dossier.test && !lenboxEnTest()) {
    await journal("lenbox_dossier_de_test_ecarte", dossier.reference, {
      dossier: dossier.id, statut: dossier.statut,
    });
    return NextResponse.json({ ok: true });
  }

  if (!dossier.finance) {
    /* DRAFT, PAYMENT_ACTIVE, AWAITING_BANK_RESPONSE, USER_ACTION_REQUIRED,
       ALL_REJECTED, ABANDONNED, REIMBOURSED… : rien à encaisser. Seul FINANCED compte —
       traiter un état intermédiaire comme payé convoquerait un candidat dont la banque
       n'a pas répondu. On trace et on s'arrête. */
    await journal("lenbox_dossier_non_finance", dossier.reference, {
      dossier: dossier.id, statut: dossier.statut,
    });
    return NextResponse.json({ ok: true });
  }

  /* `customer_ref_id` est le SEUL fil entre le dossier et notre commande, et il vient
     de LENBOX, jamais du webhook.
     🔴 Il n'y a volontairement AUCUN `?? sig.reference` ici. Ce repli a existé et il
     était une faille : le webhook n'étant pas signé, un tiers aurait POSTé la référence
     de son choix et fait valider la commande d'un autre — la relecture du statut n'y
     changeait rien, puisque c'est le LIEN vers notre dossier qui venait de lui.
     Un dossier financé sans référence côté Lenbox est une anomalie : elle se traite par
     une alerte à un humain, pas par une supposition. */
  const ref = dossier.reference;
  if (!ref) {
    await journal("lenbox_finance_sans_reference", null, {
      dossier: dossier.id, statut: dossier.statut,
    });
    await alerter(
      `Dossier Lenbox financé sans référence — ${dossier.id}`,
      `<p>Un dossier Lenbox est <b>financé</b>, mais il ne porte aucun
       <code>customer_ref_id</code> : impossible de savoir à quelle commande il
       correspond.</p>
       <p>Dossier : <b>${ech(dossier.id)}</b> · Statut : ${ech(dossier.statut)}</p>
       <p>👉 À rapprocher à la main depuis le tableau de bord Lenbox.</p>`,
      null,
    );
    return NextResponse.json({ ok: true });
  }

  /* ── LE MONTANT : SECONDE RELECTURE, SUR UN IDENTIFIANT QUE NOUS AVONS CHOISI ──
   *
   * La réponse de statut d'un dossier NE PORTE AUCUN MONTANT (schéma OpenAPI :
   * `DemandeStatus` = id, agency_id, is_test, status, accepted_option,
   * customer_ref_id). Sans ce second appel, on encaisserait sans vérifier COMBIEN a
   * été financé — c'est-à-dire qu'un dossier de 50 € validerait une commande de 660 €.
   *
   * On relit donc la SESSION, dont l'identifiant a été enregistré au moment de la
   * commande (`lenbox_session_id`). C'est la lecture la plus sûre dont on dispose :
   * ni la question ni la réponse ne viennent d'un tiers. Et elle sert en même temps de
   * liaison — si la session enregistrée ne désigne pas la même commande, on refuse.
   */
  const { data: liee } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("lenbox_session_id, reference_paiement, montant, paye_le")
    .eq("id", ref)
    .maybeSingle();

  if (!liee) {
    await journal("lenbox_commande_inconnue", null, { dossier: dossier.id, reference: ref });
    await alerter(
      `Dossier Lenbox financé, commande inconnue — ${dossier.id}`,
      `<p>Un dossier Lenbox est <b>financé</b> et désigne la commande
       <code>${ech(ref)}</code>, qui n'existe pas dans le CRM.</p>
       <p>Dossier : <b>${ech(dossier.id)}</b></p>
       <p>👉 À rapprocher à la main : le candidat a un financement accordé et aucune
       inscription.</p>`,
      null,
    );
    return NextResponse.json({ ok: true });
  }

  const sessionId = (liee as any).lenbox_session_id;
  if (!sessionId) {
    await journal("lenbox_commande_sans_session", ref, { dossier: dossier.id });
    await alerter(
      `Dossier Lenbox financé, session inconnue — ${dossier.id}`,
      `<p>La commande <code>${ech(ref)}</code> n'a aucune session Lenbox enregistrée :
       le montant financé ne peut pas être vérifié, et <b>rien n'a été validé</b>.</p>
       <p>Dossier : <b>${ech(dossier.id)}</b></p>
       <p>👉 À vérifier dans le tableau de bord Lenbox avant toute convocation.</p>`,
      ref,
    );
    return NextResponse.json({ ok: true });
  }

  let session;
  try {
    session = await lireSessionLenbox(String(sessionId));
  } catch (e) {
    const motif = e instanceof Error ? e.message : "inconnue";
    await journal("lenbox_session_relecture_echec", ref, {
      dossier: dossier.id, session: sessionId, erreur: motif,
    });
    await alerter(
      `Montant Lenbox non vérifiable — dossier ${dossier.id}`,
      `<p>Le dossier <b>${ech(dossier.id)}</b> est financé, mais la relecture de sa
       session (<code>${ech(String(sessionId))}</code>) a échoué : <b>le montant n'a pas
       pu être confirmé, rien n'a été validé</b>.</p>
       <p>Erreur : ${ech(motif)}</p>
       <p>👉 À vérifier dans le tableau de bord Lenbox avant toute convocation.</p>`,
      ref,
    );
    return NextResponse.json({ ok: true });
  }

  // La session doit désigner la MÊME commande que le dossier. Sinon, un financement
  // paierait la commande d'un tiers.
  if (session.reference && session.reference !== ref) {
    await journal("lenbox_session_autre_commande", ref, {
      dossier: dossier.id, session: session.id, reference_session: session.reference,
    });
    await alerter(
      `Dossier Lenbox rattaché à une autre commande — ${dossier.id}`,
      `<p>Le dossier <b>${ech(dossier.id)}</b> se dit financé pour la commande
       <code>${ech(ref)}</code>, mais la session enregistrée pour cette commande
       désigne <code>${ech(session.reference)}</code>.</p>
       <p><b>Rien n'a été validé.</b> Un financement ne règle pas la commande d'un tiers.</p>
       <p>👉 À vérifier dans le tableau de bord Lenbox avant toute convocation.</p>`,
      ref,
    );
    return NextResponse.json({ ok: true });
  }

  await journal("lenbox_dossier_finance", ref, {
    dossier: dossier.id, session: session.id, statut: dossier.statut,
    echeancier: dossier.echeancierAccepte, montant: session.montant,
  });

  const r = await validerCommandePayee({
    commandeId: ref,
    moyen: "lenbox",
    referencePaiement: dossier.id,
    // Le montant vient de la session relue chez Lenbox, jamais du webhook.
    montantRecu: session.montant,
    auteur: "Lenbox",
  });

  if (!r.ok && r.motif === "ecriture") {
    await alerter(
      `Commande Lenbox non enregistrée — ${dossier.id}`,
      `<p>Le dossier <b>${ech(dossier.id)}</b> est financé, mais l'enregistrement de la
       commande <code>${ech(ref)}</code> a échoué.</p>
       <p>Détail : ${ech(r.detail ?? "inconnu")}</p>
       <p>👉 Le candidat a payé : à débloquer depuis le CRM.</p>`,
      ref,
    );
  }

  return NextResponse.json({ ok: true });
}
