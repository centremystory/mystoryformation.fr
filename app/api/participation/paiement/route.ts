/**
 * MYSTORY — POST /api/participation/paiement  (PUBLIC, appelé par Mollie)
 *
 * Le webhook de la participation forfaitaire CPF. Troisième frère de
 * `/api/paiements/mollie` (pré-inscriptions examen) et `/api/commande/paiement`
 * (commandes composées), et distinct d'eux pour la même raison : chacun cherche
 * sa référence dans SA table. Apprendre à l'un à chercher à trois endroits
 * reviendrait à toucher un chemin qui encaisse déjà de l'argent.
 *
 * 🔴 LES TROIS PRINCIPES DU WEBHOOK MOLLIE, qui valent ici à l'identique et dont
 * aucun ne doit sauter :
 *
 * 1. **Le webhook ne transmet QUE l'identifiant**, jamais le statut. On
 *    redemande donc toujours l'état à Mollie. C'est ce qui empêche n'importe qui
 *    d'appeler cette URL pour se déclarer payé : connaître l'adresse ne suffit
 *    pas.
 *
 * 2. **Le montant est vérifié.** Un encaissement partiel ou divergent ne valide
 *    RIEN : il alerte. Ici c'est encore plus net qu'ailleurs — la participation
 *    est un forfait, elle vaut `TICKET_MODERATEUR` ou elle ne vaut rien. Un
 *    paiement de 1 € ne doit pas débloquer une convention.
 *
 * 3. **On répond toujours 200.** Mollie réessaie tant qu'il n'a pas de 200, et
 *    un échec de notre côté ne doit pas déclencher une avalanche de reprises. Ce
 *    qui compte est journalisé ; l'état réel reste chez Mollie, relisible à tout
 *    moment.
 *
 * 🔴 ET C'EST LA SEULE ROUTE QUI ÉCRIT `participation_forfaitaire_reglee`.
 * La page candidat ne l'écrit pas, la route de paiement ne l'écrit pas : seul ce
 * webhook, et seulement après avoir relu le montant à la source. Cette colonne
 * débloque la convention de formation (cf. lib/gates.ts) — c'est-à-dire un
 * document officiel et une déclaration de service fait. Elle ne se met pas à
 * vrai sur la foi d'un formulaire.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lirePaiement } from "@/lib/mollie";
import {
  TICKET_MODERATEUR, contexteDossier, euros, PREFIXE_REFERENCE_PARTICIPATION,
} from "@/lib/liensCandidat";
import { journaliser, prevenirSecretariat, ligneInterne } from "@/lib/liensCandidatPages";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { COURRIEL_PUBLIC, TEL_PUBLIC } from "@/lib/pagePublique";
import { ech } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
    await journaliser("participation_webhook_invalide", null, { recu: id.slice(0, 40) });
    return NextResponse.json({ ok: true });
  }

  let etat;
  try {
    etat = await lirePaiement(id);
  } catch (e) {
    await journaliser("participation_relecture_echec", null, {
      paiement: id, erreur: e instanceof Error ? e.message : "inconnue",
    });
    return NextResponse.json({ ok: true });
  }

  const ref = String(etat.reference ?? "");
  if (!ref.startsWith(PREFIXE_REFERENCE_PARTICIPATION)) {
    // Référence d'un autre flux (commande, pré-inscription) ou absente : ce n'est
    // pas à nous de la traiter, et surtout pas à deviner. On trace et on sort.
    await journaliser("participation_reference_etrangere", null, { paiement: id, reference: ref.slice(0, 80) });
    return NextResponse.json({ ok: true });
  }
  const dossierId = ref.slice(PREFIXE_REFERENCE_PARTICIPATION.length);

  if (!etat.paye) {
    await journaliser("participation_paiement_non_abouti", dossierId, { paiement: id, statut: etat.statut });
    return NextResponse.json({ ok: true });
  }

  /* ── LE CONTRÔLE DU MONTANT ────────────────────────────────────────────────
     La participation est un FORFAIT. Un montant qui diverge n'est pas « presque
     bon » : il ne débloque rien et il alerte. Tolérance au centime pour
     absorber les arrondis de Mollie, pas davantage. */
  const recu = Number(etat.montant ?? 0);
  if (!isFinite(recu) || Math.abs(recu - TICKET_MODERATEUR) > 0.01) {
    await journaliser("participation_montant_divergent", dossierId, {
      paiement: id, recu, attendu: TICKET_MODERATEUR,
    });
    await prevenirSecretariat(
      `⚠️ Participation CPF — montant divergent (${euros(recu)} au lieu de ${euros(TICKET_MODERATEUR)})`,
      "Paiement de participation à vérifier",
      `<p>Un paiement de participation forfaitaire est arrivé avec un montant qui ne correspond
       pas au forfait. <b>La participation n'a PAS été marquée comme réglée</b> et la convention
       reste bloquée.</p>
       ${ligneInterne("Paiement Mollie", id)}
       ${ligneInterne("Montant reçu", euros(recu))}
       ${ligneInterne("Montant attendu", euros(TICKET_MODERATEUR))}
       ${ligneInterne("Dossier", dossierId)}
       <p>À reprendre à la main : soit rembourser, soit compléter.</p>`,
      dossierId,
    );
    return NextResponse.json({ ok: true });
  }

  /* ── L'ÉCRITURE, IDEMPOTENTE ───────────────────────────────────────────────
     Mollie rappelle plusieurs fois le même paiement (c'est documenté et normal).
     L'`update` est conditionné sur `participation_forfaitaire_reglee = false` :
     le second appel ne trouve plus la ligne, n'écrit rien, et n'envoie pas un
     second reçu au candidat. C'est la BASE qui tranche, pas l'ordre des appels. */
  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .update({ participation_forfaitaire_reglee: true })
    .eq("id", dossierId)
    .eq("participation_forfaitaire_reglee", false)
    .select("id")
    .maybeSingle();

  if (error) {
    await journaliser("participation_ecriture_echec", dossierId, { paiement: id, erreur: error.message });
    await prevenirSecretariat(
      `⚠️ Participation CPF payée mais NON enregistrée — dossier ${dossierId}`,
      "Paiement reçu, enregistrement en échec",
      `<p><b>L'argent est arrivé, la base n'a pas été mise à jour.</b> À corriger à la main :
       cocher la participation comme réglée sur la fiche du dossier.</p>
       ${ligneInterne("Paiement Mollie", id)}
       ${ligneInterne("Montant", euros(recu))}
       ${ligneInterne("Dossier", dossierId)}
       ${ligneInterne("Erreur", error.message)}`,
      dossierId,
    );
    return NextResponse.json({ ok: true });
  }

  // Déjà enregistré par un appel précédent : rien à refaire, et surtout pas de second reçu.
  if (!data) {
    await journaliser("participation_paiement_deja_enregistre", dossierId, { paiement: id });
    return NextResponse.json({ ok: true });
  }

  await journaliser("participation_reglee", dossierId, { paiement: id, montant: recu });

  /* Le reçu au candidat et l'avis au secrétariat. Un échec d'envoi n'annule RIEN :
     l'argent est encaissé et la base est à jour. C'est la leçon de la panne de
     convocations des 09-10/09/2026 — on journalise l'état réel de l'envoi plutôt
     que de laisser croire qu'il est parti. */
  const c = await contexteDossier(dossierId);
  const nom = c ? `${c.prenom} ${c.nom}`.trim() : dossierId;

  let recuEnvoye = false;
  let recuErreur: string | null = null;
  if (c?.email) {
    try {
      const r = await envoyerEmail({
        a: c.email,
        objet: `Votre participation de ${euros(TICKET_MODERATEUR)} est bien reçue — MYSTORY`,
        html: gabaritEmail("Participation CPF réglée", `
          <p>Bonjour ${ech(c.prenom)},</p>
          <p>Nous avons bien reçu votre participation forfaitaire de
          <b>${ech(euros(TICKET_MODERATEUR))}</b>. Ce message vous sert de reçu.</p>
          <p><b>Vous n'avez plus rien à régler</b> pour votre formation : le reste est pris en
          charge par votre compte personnel de formation.</p>
          <p>Notre secrétariat enchaîne maintenant sur votre convention de formation, que vous
          recevrez à signer.</p>
          <p>Une question ? Appelez-nous au ${ech(TEL_PUBLIC)} ou écrivez à
          ${ech(COURRIEL_PUBLIC)}.</p>`),
        entite: "dossiers",
        entiteId: dossierId,
        auteur: "Mollie",
      });
      recuEnvoye = !!r.ok;
      recuErreur = r.ok ? null : (r.erreur ?? "inconnue");
    } catch (e) {
      recuErreur = e instanceof Error ? e.message : "inconnue";
    }
  }

  await prevenirSecretariat(
    `Participation CPF réglée — ${nom} · ${euros(recu)}`,
    "Participation forfaitaire CPF encaissée",
    `<p>La participation forfaitaire a été réglée en ligne par le candidat.
     <b>La convention de formation n'est plus bloquée sur ce point.</b></p>
     ${ligneInterne("Candidat", nom)}
     ${ligneInterne("Montant", euros(recu))}
     ${ligneInterne("Paiement Mollie", id)}
     ${ligneInterne("N° dossier EDOF", c?.numeroEdof)}
     ${ligneInterne("Reçu envoyé au candidat", recuEnvoye ? "oui" : `NON — ${recuErreur ?? "pas d'adresse"}`)}`,
    dossierId,
  );

  await journaliser("participation_recu_envoye", dossierId, {
    paiement: id, recu_envoye: recuEnvoye, recu_erreur: recuErreur,
  });

  return NextResponse.json({ ok: true });
}
