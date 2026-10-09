/**
 * MYSTORY — valider une commande payée. Un seul chemin, deux prestataires.
 *
 * 09/10/2026. Mollie (carte) et Lenbox (3 ou 4 fois) encaissent la même commande et
 * doivent produire exactement le même effet. Ce fichier est cet effet, écrit une fois :
 * deux copies auraient divergé, et c'est toujours celle qu'on ne relit pas qui finit
 * par encaisser sans convoquer.
 *
 * ── CE QUE « VALIDER » VEUT DIRE ────────────────────────────────────────────
 * Poser `paye_le` sur la commande ET sur chacune de ses pré-inscriptions. Rien de plus.
 * C'est le robot n8n « Inscriptions en ligne payées → conversion » qui prend le relais
 * dans les 5 minutes : il lit les pré-inscriptions « en_attente » qui portent un
 * `paye_le` et déclenche la conversion — attestation, convocation, facture. On ne
 * réimplémente pas cette chaîne ici, on l'alimente.
 *
 * ── CE QUE ÇA NE FAIT PAS ───────────────────────────────────────────────────
 * Les HEURES de préparation ne sont converties par personne : aucun chemin automatique
 * n'existe pour vendre et facturer une prestation de formation. Un e-mail nommé part au
 * secrétariat avec les dates à planifier. Inventer une facture de formation sans que la
 * direction ait tranché son format serait pire que de demander à un humain.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { euros, jourLisible } from "@/lib/inscriptionEnLigne";
import { MATINEE_HORAIRE, PREPARATION_TAUX_HORAIRE } from "@/lib/commande";
import { ech, enTete } from "@/lib/html";

/**
 * Un seul objet à champs optionnels plutôt qu'une union discriminée : ce dépôt compile
 * avec `strict: false`, et TypeScript n'y réduit pas une union sur son discriminant.
 * Voir la même remarque sur `LectureCommande` dans lib/commande.ts.
 */
export type ResultatValidation = {
  ok: boolean;
  /** Si `ok` : le paiement avait déjà été pris en compte. */
  dejaTraitee?: boolean;
  /** Si `ok` : nombre de pré-inscriptions ouvertes à la conversion. */
  lignes?: number;
  /** Si `!ok` : pourquoi. */
  motif?: "introuvable" | "montant" | "ecriture";
  detail?: string;
};

async function journal(evenement: string, id: string | null, detail: Record<string, unknown>, auteur: string) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "commandes_en_ligne", entite_id: id, evenement,
      nouvelle_valeur: detail, auteur,
    });
  } catch {
    /* le journal ne doit jamais faire échouer la prise en compte d'un paiement */
  }
}

/**
 * Valide une commande dont le paiement a été CONFIRMÉ À LA SOURCE.
 *
 * ⚠️ Cette fonction fait confiance à son appelant sur un seul point : que le statut
 * « payé » ait été relu auprès du prestataire, et non lu dans le corps d'un webhook.
 * Les deux récepteurs le font (`/api/commande/paiement` relit chez Mollie,
 * `/api/paiements/lenbox` relit le dossier chez Lenbox). Appeler ceci depuis un corps
 * de requête non vérifié rendrait l'encaissement falsifiable par un POST anonyme.
 *
 * `montantRecu` à null = le prestataire ne l'a pas donné : on refuse, on n'estime pas.
 */
export async function validerCommandePayee(args: {
  commandeId: string;
  moyen: "mollie" | "lenbox";
  referencePaiement: string;
  montantRecu: number | null;
  auteur: string;
}): Promise<ResultatValidation> {
  const { data: cmd } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("*")
    .eq("id", args.commandeId)
    .maybeSingle();

  if (!cmd) {
    await journal("commande_introuvable", null, {
      reference: args.commandeId, paiement: args.referencePaiement, moyen: args.moyen,
    }, args.auteur);
    return { ok: false, motif: "introuvable" };
  }

  const c = cmd as any;

  // Déjà traité : Mollie comme Lenbox rappellent volontiers plusieurs fois.
  if (c.paye_le) return { ok: true, dejaTraitee: true, lignes: 0 };

  // Le montant encaissé doit correspondre au total recalculé. Un encaissement partiel
  // ou divergent n'ouvre PAS l'inscription : il alerte. C'est la règle du webhook Mollie
  // existant, et elle vaut ici à l'identique.
  const attendu = Number(c.montant);
  if (args.montantRecu == null || Math.abs(args.montantRecu - attendu) > 0.01) {
    await journal("commande_montant_divergent", args.commandeId, {
      attendu, recu: args.montantRecu, paiement: args.referencePaiement, moyen: args.moyen,
    }, args.auteur);
    await envoyerEmail({
      a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
      objet: enTete(`Commande en ligne au mauvais montant — ${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}`),
      html: gabaritEmail("Montant encaissé différent de la commande", `
        <p>Un paiement est arrivé pour un montant qui ne correspond pas à la commande.
        <b>La commande n'a pas été validée</b> — merci de vérifier avant de convoquer.</p>
        <p>Attendu : <b>${euros(attendu)}</b><br>Reçu : <b>${ech(args.montantRecu ?? "?")} €</b><br>
        Paiement ${ech(args.moyen)} : ${ech(args.referencePaiement)}</p>
        <p style="color:#888;font-size:12px">Commande ${ech(args.commandeId)}</p>`),
      entite: "commandes_en_ligne", entiteId: args.commandeId,
    });
    return { ok: false, motif: "montant" };
  }

  const maintenant = new Date().toISOString();

  // Course : deux notifications simultanées n'encaissent qu'une fois. Le filtre
  // `is paye_le null` fait office de verrou — c'est le mécanisme déjà retenu pour les
  // pré-inscriptions, et il tient sans transaction.
  const { data: maj, error } = await supabaseAdmin
    .from("commandes_en_ligne")
    .update({
      paye_le: maintenant,
      reference_paiement: args.referencePaiement,
      moyen_paiement: args.moyen,
      statut: "payee",
    })
    .eq("id", args.commandeId)
    .is("paye_le", null)
    .select("id");

  if (error) {
    await journal("commande_enregistrement_echec", args.commandeId, {
      paiement: args.referencePaiement, erreur: error.message,
    }, args.auteur);
    return { ok: false, motif: "ecriture", detail: error.message };
  }
  // Zéro ligne modifiée = une autre notification est passée avant nous. Rien à faire.
  if (!maj || maj.length === 0) return { ok: true, dejaTraitee: true, lignes: 0 };

  /* Le relais vers la conversion : on pose `paye_le` sur chaque pré-inscription de la
     commande. Dans les 5 minutes, le robot les convertit une par une et produit
     attestation, convocation et facture pour chacune. */
  const { data: lignes } = await supabaseAdmin
    .from("preinscriptions_examen")
    .update({ paye_le: maintenant, reference_paiement: args.referencePaiement })
    .eq("commande_id", args.commandeId)
    .eq("statut", "en_attente")
    .is("paye_le", null)
    .select("id");

  const nb = lignes?.length ?? 0;
  await journal("commande_payee", args.commandeId, {
    paiement: args.referencePaiement, moyen: args.moyen, montant: args.montantRecu,
    preinscriptions_ouvertes: nb,
  }, args.auteur);

  await prevenirSecretariat(c, nb, args.moyen);
  return { ok: true, dejaTraitee: false, lignes: nb };
}

/**
 * L'e-mail au secrétariat.
 *
 * Il dit deux choses, et la seconde est la seule qui demande une action : ce que la
 * conversion va produire toute seule, et ce que PERSONNE ne produira — les heures de
 * préparation. Un e-mail qui annonce « rien à faire » là où il reste 480 € de cours à
 * planifier serait le pire des deux mondes.
 */
async function prevenirSecretariat(c: any, lignesOuvertes: number, moyen: string): Promise<void> {
  const heures = Number(c.preparation_heures ?? 0);
  const matinees: string[] = Array.isArray(c.matinees) ? c.matinees.map(String) : [];

  const aFaire = heures > 0
    ? `<p style="background:#fff4e5;border:1px solid #ffd9a8;padding:12px;border-radius:8px">
       <b>⚠️ À planifier à la main : préparation de ${heures} h.</b><br>
       Matinées retenues (${MATINEE_HORAIRE}, ${ech(c.centre_matinees ?? "ROSNY")}) :
       <b>${matinees.map((m) => ech(jourLisible(m))).join(" · ")}</b><br>
       Part « heures de cours » : <b>${euros(heures * PREPARATION_TAUX_HORAIRE)}</b> — aucune
       conversion automatique ne la facture. La part examen, elle, est facturée par la
       conversion de la pré-inscription.</p>`
    : "";

  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: enTete(`Commande en ligne payée — ${ech(c.candidat_nom)} ${ech(c.candidat_prenom)} · ${euros(Number(c.montant))}`),
    html: gabaritEmail("Commande en ligne réglée", `
      <p>Un candidat vient de commander et de régler en ligne (${ech(moyen)}).</p>
      <p><b>${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}</b><br>
      ${ech(c.candidat_email)} · ${ech(c.candidat_telephone ?? "")}<br>
      Total : <b>${euros(Number(c.montant))}</b></p>
      <p>${lignesOuvertes} inscription${lignesOuvertes > 1 ? "s" : ""} ${lignesOuvertes > 1 ? "sont" : "est"}
      ouverte${lignesOuvertes > 1 ? "s" : ""} à la conversion : attestation, convocation et facture
      partent automatiquement dans les minutes qui suivent. Rien à faire de ce côté, sauf si une
      alerte contraire arrive dans #alertes.</p>
      ${aFaire}
      <p style="color:#888;font-size:12px">Commande ${ech(c.id)}</p>`),
    entite: "commandes_en_ligne", entiteId: String(c.id),
  });
}
