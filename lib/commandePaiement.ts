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
import {
  MATINEE_HORAIRE, PREPARATION_TAUX_HORAIRE, reassurerMatinees,
  CENTRE_MATINEES_PAR_DEFAUT, declarationDepuisLigne, declarationLisible,
} from "@/lib/commande";
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
  motif?: "introuvable" | "montant" | "ecriture" | "reference_deja_utilisee";
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

  /* ── UNE RÉFÉRENCE DE PAIEMENT NE RÈGLE QU'UNE COMMANDE ───────────────────────
   *
   * Contrôle EXPLICITE, en plus de l'index d'unicité posé en base sur
   * `reference_paiement`. Les deux ne sont pas redondants :
   *   — l'index est le seul qui tienne en cas de course, mais il n'existera qu'une fois
   *     la migration appliquée, et son rejet arrive sous la forme d'une erreur
   *     d'écriture générique, qu'on prendrait pour un incident technique ;
   *   — ce contrôle-ci dit la vérité dans le journal et dans l'alerte : « ce paiement a
   *     déjà servi », ce qui est une information d'une autre nature.
   *
   * Sans cela, un même dossier Lenbox (ou un même paiement Mollie) pourrait valider
   * plusieurs commandes : un encaissement, plusieurs convocations. */
  const { data: deja } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("id")
    .eq("reference_paiement", args.referencePaiement)
    .neq("id", args.commandeId)
    .limit(1);

  if (deja && deja.length) {
    const autre = String((deja[0] as any).id);
    await journal("commande_reference_deja_utilisee", args.commandeId, {
      paiement: args.referencePaiement, moyen: args.moyen, autre_commande: autre,
    }, args.auteur);
    await envoyerEmail({
      a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
      objet: enTete(`Paiement déjà utilisé — ${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}`),
      html: gabaritEmail("Un paiement veut régler deux commandes", `
        <p>Le paiement <code>${ech(args.referencePaiement)}</code> (${ech(args.moyen)}) est
        déjà rattaché à la commande <code>${ech(autre)}</code>, et prétend maintenant régler
        <code>${ech(args.commandeId)}</code>.</p>
        <p><b>Rien n'a été validé.</b> Un encaissement ne paie qu'une commande.</p>
        <p>👉 À vérifier avant toute convocation.</p>`),
      entite: "commandes_en_ligne", entiteId: args.commandeId,
    });
    return { ok: false, motif: "reference_deja_utilisee" };
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

  /* Les matinées, revérifiées MAINTENANT que la commande est payée.
   *
   * Une réservation impayée se périme en 30 minutes, et un financement Lenbox peut
   * mettre plus longtemps à être accordé : la chaise a pu être rendue, voire reprise.
   * On la reprend si elle est libre ; sinon on le DIT, parce que l'argent est encaissé
   * et qu'il faut replacer le candidat — pas le découvrir le samedi matin dans la salle.
   *
   * Appelé après la mise à jour du statut, et pas avant : le nettoyage des réservations
   * périmées ne considère que les commandes « en_attente » et impayées, donc cette
   * commande-ci n'est plus balayable. */
  const matinees: string[] = Array.isArray(c.matinees) ? c.matinees.map(String) : [];
  if (matinees.length) {
    const r = await reassurerMatinees(
      String(c.id), matinees, String(c.centre_matinees ?? CENTRE_MATINEES_PAR_DEFAUT),
    );
    if (!r.ok) {
      const perdues = r.perdues ?? [];
      await journal("commande_matinee_perdue", args.commandeId, { matinees: perdues }, args.auteur);
      await envoyerEmail({
        a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
        objet: enTete(`⚠️ Matinée à replacer — ${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}`),
        html: gabaritEmail("Commande payée, matinée complète", `
          <p>La commande est <b>payée</b>, mais ${perdues.length > 1 ? "des matinées" : "une matinée"}
          de préparation ${perdues.length > 1 ? "ont" : "a"} été reprise${perdues.length > 1 ? "s" : ""}
          entre-temps (financement plus long que la durée de réservation).</p>
          <p>À replacer : <b>${perdues.map((d) => ech(jourLisible(d))).join(" · ")}</b></p>
          <p><b>${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}</b><br>
          ${ech(c.candidat_email)} · ${ech(c.candidat_telephone ?? "")}</p>
          <p>👉 Appelez le candidat pour convenir d'une autre matinée. Son examen et sa
          facture, eux, suivent leur cours normalement.</p>
          <p style="color:#888;font-size:12px">Commande ${ech(String(c.id))}</p>`),
        entite: "commandes_en_ligne", entiteId: args.commandeId,
      });
    }
  }

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

  /* ── LA DÉCLARATION DE CARENCE, DANS L'E-MAIL QUE LE SECRÉTARIAT LIT ────────
   *
   * 09/10/2026. Le site écrit au candidat que ses réponses « sont vérifiées par
   * notre secrétariat ». Cet e-mail-ci est le seul que le secrétariat reçoive
   * pour CHAQUE vente réellement encaissée : c'est donc ici que la déclaration
   * devient vérifiable, et nulle part ailleurs.
   *
   * On n'affiche QUE ce qui a été déclaré, sans reconstituer de verdict : le
   * verdict a déjà été calculé et envoyé à la création de la commande (sujet
   * « Carence déclarée NON TENUE »), et il est dans le journal. Le recalculer
   * ici supposerait de relire les deux sessions, et surtout il pourrait dire
   * autre chose que le premier e-mail — deux verdicts sur la même commande,
   * c'est le défaut qu'on évite partout ailleurs dans ce dossier.
   *
   * Un passage récent ANNONCÉ est encadré : c'est le seul cas qui demande un
   * coup d'œil avant de convoquer. Une réponse « non » reste en texte simple,
   * pour qu'on sache que la question a bien été posée. */
  const decl = declarationDepuisLigne(c);
  const declLignes = declarationLisible(decl, !!c.session_tef_id, !!c.session_civique_id);
  const positive = decl.tef === true || decl.civique === true;
  const blocDeclaration = declLignes.length
    ? positive
      ? `<p style="background:#fff4e5;border:1px solid #ffd9a8;padding:12px;border-radius:8px">
         <b>⚠️ Le candidat déclare un passage récent</b><br>
         ${declLignes.map((l) => ech(l)).join("<br>")}<br><br>
         👉 Vérifiez le délai avant de convoquer. C'est une déclaration, pas une preuve :
         si la date est juste et que le délai n'est pas tenu, le certificateur refusera
         le résultat — il faut replacer le candidat sur une session ultérieure.</p>`
      : `<p style="color:#555;font-size:13px">Déclaration du candidat :<br>
         ${declLignes.map((l) => ech(l)).join("<br>")}</p>`
    : "";

  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: enTete(`Commande en ligne payée — ${ech(c.candidat_nom)} ${ech(c.candidat_prenom)} · ${euros(Number(c.montant))}`),
    html: gabaritEmail("Commande en ligne réglée", `
      <p>Un candidat vient de commander et de régler en ligne (${ech(moyen)}).</p>
      <p><b>${ech(c.candidat_nom)} ${ech(c.candidat_prenom)}</b><br>
      ${ech(c.candidat_email)} · ${ech(c.candidat_telephone ?? "")}<br>
      Total : <b>${euros(Number(c.montant))}</b></p>
      ${blocDeclaration}
      <p>${lignesOuvertes} inscription${lignesOuvertes > 1 ? "s" : ""} ${lignesOuvertes > 1 ? "sont" : "est"}
      ouverte${lignesOuvertes > 1 ? "s" : ""} à la conversion : attestation, convocation et facture
      partent automatiquement dans les minutes qui suivent. Rien à faire de ce côté, sauf si une
      alerte contraire arrive dans #alertes.</p>
      ${aFaire}
      <p style="color:#888;font-size:12px">Commande ${ech(c.id)}</p>`),
    entite: "commandes_en_ligne", entiteId: String(c.id),
  });
}
