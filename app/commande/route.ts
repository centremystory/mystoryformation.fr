/**
 * MYSTORY — GET /commande  (page PUBLIQUE)
 *
 * 09/10/2026. Le site vitrine propose depuis aujourd'hui un parcours de réservation
 * complet : le candidat choisit son examen, sa date, ses matinées de préparation et
 * ses options, et voit son total. Mais il ne pouvait pas PAYER : le CRM ne savait
 * encaisser qu'une seule session, par `/inscription-examen?session=<id>`. Une commande
 * composée partait donc chez un conseiller, qui envoyait le lien à la main — et une
 * commande qui attend un humain est une commande qu'on perd le soir et le week-end.
 *
 * Cette page est le pendant de `/inscription-examen` pour une commande composée :
 * récapitulatif au montant RECALCULÉ ici, formulaire candidat (mêmes champs), puis
 * création du paiement au POST.
 *
 *   ?session=<uuid>          session TEF IRN, si commandée
 *   &session_civique=<uuid>  session d'examen civique, si commandée
 *   &mention=CSP|CR|NAT      obligatoire dès que le civique est commandé
 *   &preparation=<heures>    3, 6, 9 ou 12 — absent s'il n'y a pas de préparation
 *   &matinees=AAAA-MM-JJ,…   exactement preparation/3 dates
 *   &options=passetontef,prepmyfuture
 *                            ⚠️ `prepcivique` a été RETIRÉ le 09/10/2026 (décision
 *                            du dirigeant : « c'est interdit à mon avis et par
 *                            rapport aux lois, je préfère prendre 0 risque »).
 *                            `lireCommande()` ne reconnaît plus la valeur et REFUSE
 *                            la commande qui la porte, plutôt que de l'ignorer en
 *                            silence : une vieille URL en circulation ne peut donc
 *                            plus revendre cette plateforme.
 *   &paiement=mollie|lenbox  le moyen DEMANDÉ sur le site. Il présélectionne
 *                            l'échéancier ici ; il ne dispense d'aucun contrôle,
 *                            `fractionnePour()` tranche toujours (voir plus bas).
 *   &carence_tef=oui|non           déclaration du candidat sur ses précédents
 *   &carence_tef_dernier=…         passages, et la date quand il y en a une.
 *   &carence_civique=oui|non       Conservée, affichée, remontée au secrétariat :
 *   &carence_civique_dernier=…     le site le PROMET au candidat (voir lib/commande.ts).
 *
 * AUCUN MONTANT NE CIRCULE DANS CETTE URL, volontairement. Tout est recalculé par
 * `lireCommande()` — tarifs d'examen, règle des 7 jours ouvrés, prix de la
 * préparation, prix des plateformes, places restantes des matinées. Si le total
 * diverge de ce que le site a affiché, c'est le CRM qui a raison.
 *
 * Aucun secret, aucune donnée d'un autre candidat : la page ne lit que des sessions
 * publiques. Déclarée publique dans middleware.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { euros, jourLisible } from "@/lib/inscriptionEnLigne";
import { MOTIVATIONS_CCI } from "@/lib/inscriptionEnLigne";
import {
  lireCommande, matineesDisponibles, CAPACITE_MATINEE, MATINEE_HORAIRE,
  FENETRE_MATINEES_JOURS, MENTIONS_PAR_CODE, dateExamenLaPlusProche,
  declarationLisible, type Commande,
} from "@/lib/commande";
import { fractionnePour, joursCalendairesAvant, libelleRenonciation, DELAI_RETRACTATION_JOURS } from "@/lib/lenbox";
import { ech } from "@/lib/html";
import { pagePublique, adresseCentre, TEL_PUBLIC } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 09/10/2026 — l'habillage vient de lib/pagePublique.ts, partagé avec les autres
// pages publiques : une seule charte, un seul pied de page légal.
const TEL = TEL_PUBLIC;

function opts(liste: readonly string[]) {
  return liste.map((o) => `<option value="${ech(o)}">${ech(o)}</option>`).join("");
}

/**
 * La page de refus.
 *
 * Elle DIT la raison. Un candidat qui a rempli un parcours entier et qui tombe sur
 * « une erreur est survenue » appelle, ou s'en va : dans les deux cas on a perdu la
 * vente. Quand le refus vient d'une matinée complète, on montre en plus la fenêtre
 * de matinées avec les complètes barrées — c'est la réponse utile, pas un diagnostic.
 */
async function refus(erreurs: string[], dateExamen: string | null, centre: string | null) {
  let liste = "";
  if (dateExamen) {
    const mat = await matineesDisponibles(dateExamen, centre ?? undefined);
    if (mat.length) {
      liste = `<h2>Les matinées de cet examen</h2>
      <p class="sous">Une matinée accueille ${CAPACITE_MATINEE} personnes au maximum, du lundi au
      samedi, de ${MATINEE_HORAIRE}.</p>
      <div>${mat.map((m) => `
        <div class="mat${m.restantes <= 0 ? " pleine" : ""}">
          <span>${ech(m.label)}${m.memeJour ? " <b>(matin de votre examen)</b>" : ""}</span>
          <span class="r">${m.restantes > 0 ? `${m.restantes} place${m.restantes > 1 ? "s" : ""}` : "complète"}</span>
        </div>`).join("")}</div>`;
    }
  }

  return new NextResponse(
    pagePublique({ titre: "Commande à revoir", atouts: false, corps: `<div class="carte">
      <h1>Nous ne pouvons pas valider cette commande</h1>
      ${erreurs.map((e) => `<div class="err">${ech(e)}</div>`).join("")}
      <p class="sous">Reprenez votre choix sur
      <a href="https://www.mystoryformation.fr/prochaines-sessions-examen">le calendrier des sessions</a>,
      ou appelez-nous au <b>${TEL}</b> — nous finalisons votre inscription avec vous.</p>
      ${liste}
    </div>` }),
    { status: 409, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/**
 * « 3 places restantes ».
 *
 * 09/10/2026, demande d'Arudhan : « en mettant le nombre de places
 * disponibles ». Le compte n'est pas calculé ici — il vient de `lireCommande()`,
 * à la même seconde que le devis et contre les mêmes compteurs que ceux qui
 * refusent la commande. Deux comptes qui se recalculent séparément finissent
 * toujours par se contredire.
 *
 * Toujours FACTUEL : une rareté inventée ou gonflée est une pratique commerciale
 * trompeuse (art. L. 121-2 du code de la consommation), et un candidat qui se
 * présente sur une place inexistante coûte infiniment plus cher qu'une vente
 * perdue. Un nombre qu'on n'a pas ne s'affiche pas : l'appelant passe `null`.
 *
 * 09/10/2026 (soir) — on MET EN AVANT la rareté quand elle est VRAIE. En dessous
 * de `SEUIL_RARETE`, le compte passe en rouge et s'écrit « plus que N places ».
 * C'est la réponse à la demande du dirigeant (« que ça parte vite, pour donner
 * envie ») : la pression vient du stock réel, jamais d'un chiffre arrangé. La
 * capacité d'une matinée a d'ailleurs été ramenée de 15 à 6 le même soir pour
 * que cette rareté EXISTE au lieu d'être simulée — voir `CAPACITE_MATINEE`.
 */
const SEUIL_RARETE = 3;

function places(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
  const pl = n > 1 ? "s" : "";
  return n <= SEUIL_RARETE
    ? `<span class="ou rare">Plus que ${n} place${pl}</span>`
    : `<span class="ou">${n} place${pl} restante${pl}</span>`;
}

/** Le récapitulatif, ligne à ligne, au montant recalculé. */
function recapitulatif(c: Commande): string {
  /* Les places d'une matinée ne s'affichent que si on en a UNE PAR MATINÉE.
     `matineesRestantes` est aligné sur `matinees` par construction, mais un
     décalage afficherait le compte d'un autre jour — on préfère ne rien dire. */
  const comptesMatinees = c.matineesRestantes.length === c.matinees.length;

  const sessions = [
    c.tef ? `<div class="session">
        <div class="t">TEF IRN — ${ech(jourLisible(c.tef.date_examen))}</div>
        <div class="d">${ech(c.tef.horaire)} · ${ech(c.tef.centre_nom)}
          ${adresseCentre(c.tef.centre_nom) ? `<span class="ou">${ech(adresseCentre(c.tef.centre_nom))}</span>` : ""}
          ${places(c.tef.places_restantes)}
        </div>
      </div>` : "",
    c.civique ? `<div class="session">
        <div class="t">Examen civique — ${ech(jourLisible(c.civique.date_examen))}</div>
        <div class="d">${ech(c.civique.horaire)} · ${ech(c.civique.centre_nom)} · mention ${ech(c.mention)}
          ${adresseCentre(c.civique.centre_nom) ? `<span class="ou">${ech(adresseCentre(c.civique.centre_nom))}</span>` : ""}
          ${places(c.civique.places_restantes)}
        </div>
      </div>` : "",
    c.matinees.length ? `<div class="session">
        <div class="t">Préparation — ${c.heures} h en ${c.matinees.length} matinée${c.matinees.length > 1 ? "s" : ""}</div>
        <div class="d">${ech(MATINEE_HORAIRE)}</div>
        <div style="margin-top:6px">${c.matinees.map((m, i) => `
          <div class="mat">
            <span>${ech(jourLisible(m))}</span>
            ${comptesMatinees ? `<span class="r">${c.matineesRestantes[i]} place${c.matineesRestantes[i] > 1 ? "s" : ""}</span>` : ""}
          </div>`).join("")}</div>
      </div>` : "",
  ].join("");

  const lignes = c.lignes.map((l) => `<div class="ligne">
      <span>${ech(l.libelle)}</span><b>${euros(l.prix)}</b>
    </div>`).join("");

  return `<div class="carte">
  <h1>Votre commande</h1>
  <p class="sous">Vérifiez votre récapitulatif, renseignez vos informations, puis réglez.
  Vous recevrez votre convocation et votre facture par e-mail dès le règlement enregistré.</p>
  ${sessions}
  <h2>Montant</h2>
  <div style="margin-top:8px">${lignes}
    <div class="total"><span>Total</span><span>${euros(c.montant)}</span></div>
  </div>
  ${c.heures > 0 ? `<p class="note">L'examen TEF IRN est <b>compris dans la préparation</b> : il n'est
   pas facturé en plus. Les ${c.heures} h se tiennent dans nos locaux, de ${ech(MATINEE_HORAIRE)}.</p>` : ""}
  ${c.urgence ? `<div class="urgence"><b>Tarif d'urgence.</b> Une de vos dates a lieu dans moins de
   7 jours ouvrés : nous rouvrons une liste déjà arrêtée, prévenons la CCI et produisons votre
   convocation dans la journée.</div>` : ""}
  ${declaration(c)}
</div>`;
}

/**
 * Ce que le candidat a déclaré sur ses précédents passages, REDIT avant qu'il paie.
 *
 * Le site lui a promis que ces réponses « partent avec votre réservation » : la
 * moindre des choses est qu'il les retrouve ici, et qu'il puisse corriger avant
 * de payer plutôt qu'après l'épreuve. C'est aussi la seule occasion où une
 * erreur de saisie se répare sans rien coûter à personne.
 *
 * Quand le délai n'est pas tenu, on le DIT en clair — sans refuser la commande
 * (le pourquoi est écrit au long dans `lib/commande.ts`). Un avertissement
 * assorti du téléphone fait appeler ; un refus sec fait fermer l'onglet, et le
 * candidat ira passer son épreuve trop tôt ailleurs.
 */
function declaration(c: Commande): string {
  const lignes = declarationLisible(c.declaration, !!c.tef, !!c.civique);
  if (!lignes.length && !c.carenceNonTenue.length) return "";

  /* « Une date nous manque » ne s'adresse QU'À celui qui a répondu « oui ».
     `carenceAVerifier` couvre aussi le cas où la question n'a jamais voyagé
     (lien fabriqué hors du parcours) : réclamer alors une date à un candidat à
     qui on n'a rien demandé le laisse chercher ce qu'il a bien pu oublier. Ce
     cas-là part au secrétariat, qui posera la question lui-même. */
  const aRepondu = c.declaration.tef === true || c.declaration.civique === true;
  const aCorriger = aRepondu ? c.carenceAVerifier : [];

  return `
  <h2>Votre déclaration</h2>
  ${lignes.length ? `<div style="margin-top:8px">${lignes.map((l) => `
    <div class="mat"><span>${ech(l)}</span></div>`).join("")}</div>` : ""}
  ${c.carenceNonTenue.length ? `<div class="urgence">
    <b>⚠️ À vérifier avant de régler.</b> D'après la date que vous avez déclarée, le délai de
    carence du certificateur ne serait pas tenu — et <b>un résultat obtenu avant la fin de ce
    délai est refusé</b>. Appelez-nous au <b>${TEL}</b> avant de payer : nous vous plaçons sur
    une session qui compte.
    ${c.carenceNonTenue.map((a) => `<div style="margin-top:8px">${ech(a)}</div>`).join("")}
  </div>` : ""}
  ${aCorriger.length ? `<div class="urgence">
    <b>Une date nous manque.</b> Vous avez indiqué avoir passé une épreuve récemment, mais la date
    reçue n'est pas exploitable : nous ne pouvons donc pas vérifier votre délai de carence. Notre
    secrétariat vous rappellera, ou appelez-nous au <b>${TEL}</b> — c'est une minute au téléphone
    contre un résultat refusé le jour de l'épreuve.
  </div>` : ""}
  <p class="note">Ces réponses sont transmises à notre secrétariat avec votre commande. Si l'une
  d'elles est inexacte, appelez-nous au ${TEL} — une date corrigée avant l'épreuve ne coûte rien,
  après elle coûte le résultat.</p>`;
}

/**
 * Le choix du moyen de paiement.
 *
 * Carte bancaire toujours (Mollie, qui présente aussi Klarna dès lors que le paiement
 * porte son détail de commande et son adresse de facturation — voir lib/mollie.ts).
 * Fractionné Lenbox en plus, quand il est permis.
 *
 * Le fractionné est PRIVILÉGIÉ par le dirigeant, et pas pour une question de commission :
 * Lenbox verse l'argent sous 48 h en une seule fois — la trésorerie n'attend pas les
 * échéances du client — et c'est Lenbox qui porte le risque d'impayé et gère les litiges.
 * Avec Klarna via Mollie, nous restons le commerçant. Pour une entreprise dont le compte
 * est tendu, ces deux points pèsent plus que quelques dixièmes de pourcent.
 *
 * `fractionnePour()` tranche : seuil, bornes, configuration, et surtout le délai de
 * rétractation de 14 jours. Quand il écarte le fractionné pour cette raison, on AFFICHE
 * la raison — une option qui disparaît en silence passe pour une option qui n'existe pas,
 * alors que c'est un argument pour réserver plus tôt.
 *
 * Les mensualités affichées sont celles que le candidat paiera VRAIMENT, frais client
 * compris. Jamais `total / 4`.
 *
 * ── `&paiement=` PRÉSÉLECTIONNE, IL NE CONTOURNE RIEN ───────────────────────
 * 09/10/2026. Le site envoie `&paiement=mollie|lenbox` : le candidat a déjà cliqué
 * « Payer en 3, 4 ou 10 fois » là-bas, et il devait RE-COCHER l'échéancier ici. Un
 * clic de trop sur l'écran qui précède le paiement, c'est de l'abandon gratuit.
 *
 * Mais le paramètre ne fait QUE cocher une case : `fractionnePour()` décide seul,
 * avec le seuil de 400 €, le plafond de 4 500 € et surtout les 14 jours de
 * rétractation. S'il écarte le fractionné alors que l'URL le demandait, on retombe
 * proprement sur la carte EN L'EXPLIQUANT — on ne refuse pas la vente, et on ne
 * laisse pas le candidat croire que l'option a disparu par accident.
 *
 * Et c'est le PREMIER échéancier qui est coché, soit le 3 fois : c'est le moins
 * chargé en frais client (1,59 % contre 7 % en 10 fois). Présélectionner le plus
 * cher pour le candidat parce qu'il rapporte serait exactement le genre de défaut
 * qu'on ne veut pas avoir écrit.
 */
/**
 * Les deux cases à cocher, et pourquoi elles sont DEUX.
 *
 * 09/10/2026, demande du dirigeant : « qu'il coche les cases qu'il accepte les CGV »,
 * et « si la date est à moins de 7 jours et le financement accepté, aucun
 * remboursement n'est possible ».
 *
 * 🔴 Une seule case ne suffirait pas, et c'est le point à ne pas perdre.
 * Accepter des conditions générales N'EST PAS renoncer au droit de rétractation.
 * L'article L. 221-25 du code de la consommation exige, pour un service exécuté
 * avant la fin du délai, une DEMANDE EXPRESSE du client et la RECONNAISSANCE qu'il
 * perdra son droit — un engagement distinct, formulé pour lui-même, jamais fondu
 * dans l'acceptation des CGV ni pré-coché. D'où deux cases :
 *   1. l'acceptation des CGV — toujours, c'est le contrat ;
 *   2. la renonciation — SEULEMENT quand l'épreuve tombe dans les 14 jours, parce
 *      qu'en dehors de ce cas elle n'a aucun objet et ne ferait qu'alourdir.
 *
 * ⚠️ La renonciation ne vaut que pour la rétractation de la VENTE À DISTANCE. Celle
 * du CRÉDIT (14 jours, art. L. 312-19) est d'ordre public : aucune case ne peut y
 * faire renoncer. C'est pourquoi le fractionné reste refusé sur une session proche
 * tant que le client paie des frais — il faut d'abord qu'il sorte du régime du
 * crédit, c'est-à-dire la bascule vers les variantes sans frais client. Voir
 * `FRAIS_A_LA_CHARGE_DU_CLIENT` dans lib/lenbox.ts.
 *
 * Le texte coché est renvoyé au serveur avec la commande : une case cochée dont on
 * ne garde pas le libellé ne prouve rien le jour où quelqu'un conteste.
 */
function blocEngagements(c: Commande): string {
  const d = dateExamenLaPlusProche(c);
  const jours = d ? joursCalendairesAvant(d) : null;
  const proche = jours !== null && jours <= DELAI_RETRACTATION_JOURS;
  const texteRenonciation = d && jours !== null ? libelleRenonciation(jours, jourLisible(d)) : "";

  return `<div class="engagements">
    <label class="engagement">
      <input type="checkbox" name="cgv" value="1" required>
      <span>J'ai lu et j'accepte les
      <a href="https://www.mystoryformation.fr/conditions-generales-de-vente" target="_blank"
         rel="noopener">conditions générales de vente</a>.</span>
    </label>
    ${proche ? `<label class="engagement">
      <input type="checkbox" name="renonciation" value="1" required>
      <span>${ech(texteRenonciation)}</span>
    </label>` : ""}
    <p class="note"><b>Annulation et report.</b> Le remboursement n'est possible que
    jusqu'à <b>7 jours ouvrés</b> avant la date de l'épreuve, <b>quel que soit le moyen
    de paiement</b> — en une fois comme en plusieurs fois. Passé ce délai, et en cas
    d'absence le jour de l'épreuve, l'inscription reste due. Un report n'est accordé
    que sur <b>justificatif valable accepté par la CCI Paris Île-de-France</b> : la
    décision appartient au certificateur, pas à nous.</p>
    <p class="note"><b>Aucun retard n'est toléré.</b> Au-delà de <b>10 minutes</b>,
    l'accès à la salle est refusé et la session est perdue. En deçà, l'accès relève de
    la seule décision du surveillant ou de l'examinateur.</p>
  </div>`;
}

function moyensDePaiement(c: Commande, paiementDemande: string | null): string {
  const total = c.montant;
  const { echeanciers, motif } = fractionnePour(total, dateExamenLaPlusProche(c));
  const veutFractionne = String(paiementDemande ?? "").trim().toLowerCase() === "lenbox";

  if (echeanciers.length === 0) {
    // Sans choix à faire, le candidat ne voit sinon RIEN sur le paiement avant de
    // cliquer : on lui dit au moins ce qu'il va trouver derrière le bouton.
    return `<input type="hidden" name="moyen" value="mollie">
    <p class="note"><b>Paiement sécurisé par carte bancaire ou Klarna.</b> Vos coordonnées bancaires
    sont saisies chez notre prestataire de paiement, jamais chez nous.</p>
    ${motif ? `<p class="note"><b>Paiement en plusieurs fois :</b> ${ech(motif)}</p>` : ""}
    ${veutFractionne && !motif ? `<p class="note"><b>Paiement en plusieurs fois :</b> il n'est pas
    disponible pour cette commande. Votre règlement par carte reste possible ci-dessous, et nous
    pouvons en parler au ${TEL}.</p>` : ""}`;
  }

  return `<h2>Comment souhaitez-vous régler ?</h2>
  <div class="moyens">
    <label class="moyen">
      <input type="radio" name="moyen" value="mollie"${veutFractionne ? "" : " checked"}>
      <span><span class="l">En une fois — ${euros(total)}</span>
      <span class="m">Carte bancaire ou Klarna, paiement sécurisé. Votre convocation part dès le
      règlement enregistré.</span></span>
    </label>
    ${echeanciers.map((e, i) => `
    <label class="moyen">
      <input type="radio" name="moyen" value="lenbox:${ech(e.code)}"${veutFractionne && i === 0 ? " checked" : ""}>
      <span><span class="l">En ${e.fois} fois — ${euros(e.mensualite)} par mois</span>
      <span class="m">${e.fois} échéances de ${euros(e.mensualite)}${e.derniere !== e.mensualite ? ` (dernière : ${euros(e.derniere)})` : ""},
      soit <b>${euros(e.totalClient)}</b> au total, frais de financement compris. Financement Lenbox,
      sous réserve d'acceptation.</span></span>
    </label>`).join("")}
  </div>`;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const p = {
    session: q.get("session"),
    session_civique: q.get("session_civique"),
    mention: q.get("mention"),
    preparation: q.get("preparation"),
    matinees: q.get("matinees"),
    options: q.get("options"),
    /* La déclaration de carence du candidat. Elle n'entre dans aucun prix et ne
       refuse rien : elle est conservée, affichée, et remontée au secrétariat —
       ce que le site lui a promis à l'étape « Déclaration ». */
    carence_tef: q.get("carence_tef"),
    carence_tef_dernier: q.get("carence_tef_dernier"),
    carence_civique: q.get("carence_civique"),
    carence_civique_dernier: q.get("carence_civique_dernier"),
  };
  /* Le moyen demandé sur le site. Hors de `ParamsCommande` à dessein : il ne
     décrit PAS la commande, il ne change aucun montant, et `lireCommande()` ne
     doit rien en savoir. Il ne sert qu'à cocher une case. */
  const paiementDemande = q.get("paiement");

  const lu = await lireCommande(p);
  if (!lu.ok) {
    // Pour la liste des matinées : on a besoin de la date d'examen, qu'on relit de
    // façon minimale. Si la session elle-même est en cause, on n'affiche pas de liste.
    const { lireSession } = await import("@/lib/inscriptionEnLigne");
    const s = p.session ? await lireSession(String(p.session)) : null;
    return refus(lu.erreurs ?? [], s?.date_examen ?? null, s?.centre?.toUpperCase() ?? null);
  }
  const c = lu.commande as Commande;

  const corps = `
${recapitulatif(c)}

<form id="f" class="carte" novalidate>
  <div id="erreur"></div>
  <h1 class="h1b">Vos informations</h1>
  <p class="sous">Elles sont transmises à la CCI Paris Île-de-France pour votre inscription :
  merci de les saisir <b>exactement comme sur votre pièce d'identité</b>.</p>

  <div class="duo">
    <div><label for="civilite">Civilité <span class="obl">*</span></label>
      <select id="civilite" name="civilite" required><option value="">—</option>
        <option>Madame</option><option>Monsieur</option></select></div>
    <div><label for="genre">Genre <span class="obl">*</span></label>
      <select id="genre" name="genre" required><option value="">—</option>
        <option>Femme</option><option>Homme</option></select></div>
  </div>

  <div class="duo">
    <div><label for="nom">NOM <span class="obl">*</span></label>
      <input id="nom" name="nom" required autocomplete="family-name"></div>
    <div><label for="prenom">Prénom <span class="obl">*</span></label>
      <input id="prenom" name="prenom" required autocomplete="given-name"></div>
  </div>

  <div class="duo">
    <div><label for="date_naissance">Date de naissance <span class="obl">*</span></label>
      <input id="date_naissance" name="date_naissance" type="date" required></div>
    <div><label for="lieu_naissance">Lieu de naissance <span class="obl">*</span></label>
      <input id="lieu_naissance" name="lieu_naissance" required placeholder="Ville, pays"></div>
  </div>

  <div class="duo">
    <div><label for="nationalite">Nationalité <span class="obl">*</span></label>
      <input id="nationalite" name="nationalite" required></div>
    <div><label for="langue_maternelle">Langue maternelle <span class="obl">*</span></label>
      <input id="langue_maternelle" name="langue_maternelle" required></div>
  </div>

  <div class="duo">
    <div><label for="telephone">Téléphone <span class="obl">*</span></label>
      <input id="telephone" name="telephone" type="tel" required autocomplete="tel" placeholder="06 …"></div>
    <div><label for="email">E-mail <span class="obl">*</span></label>
      <input id="email" name="email" type="email" required autocomplete="email"></div>
  </div>

  <label for="adresse">Adresse <span class="obl">*</span></label>
  <input id="adresse" name="adresse" required autocomplete="street-address">

  <div class="duo">
    <div><label for="code_postal">Code postal <span class="obl">*</span></label>
      <input id="code_postal" name="code_postal" required inputmode="numeric" autocomplete="postal-code"></div>
    <div><label for="ville">Ville <span class="obl">*</span></label>
      <input id="ville" name="ville" required autocomplete="address-level2"></div>
  </div>

  <label for="pays">Pays <span class="obl">*</span></label>
  <input id="pays" name="pays" required value="France" autocomplete="country-name">

  <h2>Votre examen</h2>
  ${c.tef ? `
  <label for="sous_type">Motivation de votre examen TEF IRN <span class="obl">*</span></label>
  <select id="sous_type" name="sous_type" required><option value="">—</option>${opts(MOTIVATIONS_CCI)}</select>`
  : `<input type="hidden" name="sous_type" value="">`}
  ${c.civique ? `<p class="note">Mention d'examen civique retenue : <b>${ech(c.mention)}</b>.</p>` : ""}
  <label for="piece_identite">${c.tef ? "Numéro de votre pièce d'identité" : "Numéro étranger"} <span class="obl">*</span></label>
  <input id="piece_identite" name="piece_identite" required>
  <p class="note">La pièce elle-même n'est pas à téléverser : elle sera vérifiée sur place le jour
  de l'examen. Présentez-vous avec l'original en cours de validité.</p>

  ${moyensDePaiement(c, paiementDemande)}

  <div class="hp"><label>Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label></div>

  <!-- La commande repart telle qu'elle est arrivée, SANS AUCUN MONTANT : le serveur
       recalcule tout à la réception. Ce qui est ici n'est qu'un choix, jamais un prix. -->
  <input type="hidden" name="session" value="${ech(c.tef?.id ?? "")}">
  <input type="hidden" name="session_civique" value="${ech(c.civique?.id ?? "")}">
  <input type="hidden" name="mention" value="${ech(Object.keys(MENTIONS_PAR_CODE).find((k) => MENTIONS_PAR_CODE[k] === c.mention) ?? "")}">
  <input type="hidden" name="preparation" value="${ech(c.heures || "")}">
  <input type="hidden" name="matinees" value="${ech(c.matinees.join(","))}">
  <input type="hidden" name="options" value="${ech(c.options.join(","))}">

  <!-- La déclaration de carence repart telle qu'elle a été LUE, pas telle qu'elle est
       arrivée : une date illisible ou future a déjà été écartée par lireDeclaration(),
       et elle ne doit pas se réinviter à l'enregistrement. Le POST réapplique de toute
       façon la même lecture — ces champs lui épargnent seulement de perdre la réponse.
       (Pas d'accent grave dans ce commentaire : il est DANS un gabarit de chaîne.) -->
  <input type="hidden" name="carence_tef" value="${c.declaration.tef === null ? "" : (c.declaration.tef ? "oui" : "non")}">
  <input type="hidden" name="carence_tef_dernier" value="${ech(c.declaration.tefDernier ?? "")}">
  <input type="hidden" name="carence_civique" value="${c.declaration.civique === null ? "" : (c.declaration.civique ? "oui" : "non")}">
  <input type="hidden" name="carence_civique_dernier" value="${ech(c.declaration.civiqueDernier ?? "")}">

  ${blocEngagements(c)}

  <button id="b" type="submit">Continuer vers le paiement · ${euros(c.montant)}</button>
  <p class="note">En validant, vous acceptez que ces informations servent à votre inscription à
  l'examen et soient transmises à la CCI Paris Île-de-France. Conservation 5 ans. Droits d'accès et
  de rectification : contact@mystoryformation.fr.<br>
  Une matinée de préparation accueille ${CAPACITE_MATINEE} personnes au maximum et se tient dans les
  ${FENETRE_MATINEES_JOURS} jours précédant votre examen.</p>
</form>

<script>
var f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('erreur');
/* Le message vient de notre propre route, mais on l'insère en texte et jamais en HTML :
   une erreur affichée ne doit pas pouvoir exécuter quoi que ce soit dans la page. */
function afficherErreur(texte){
  e.textContent='';
  var d=document.createElement('div');
  d.className='err';
  d.textContent=texte;
  e.appendChild(d);
  window.scrollTo({top:0,behavior:'smooth'});
}
f.addEventListener('submit',async function(ev){
  ev.preventDefault();
  e.textContent='';
  var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
  var manquants=[];
  f.querySelectorAll('[required]').forEach(function(el){ if(!String(el.value).trim()) manquants.push(el); });
  if(manquants.length){
    afficherErreur('Merci de remplir tous les champs obligatoires.');
    manquants[0].focus(); return;
  }
  b.disabled=true; b.textContent='Un instant…';
  try{
    var r=await fetch('/api/commande',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j && j.ok && j.paiement){ window.location.href=j.paiement; return; }
    afficherErreur((j&&typeof j.erreur==='string')?j.erreur:"Une erreur est survenue. Appelez-nous au ${TEL}, nous finalisons votre commande.");
  }catch(_){
    afficherErreur('Connexion interrompue. Réessayez, ou appelez-nous au ${TEL}.');
  }
  b.disabled=false; b.textContent='Continuer vers le paiement';
});
</script>`;

  return new NextResponse(pagePublique({ titre: "Votre commande", corps }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
