/**
 * MYSTORY — le contenu des courriels de rendez-vous. Objets et HTML, rien d'autre.
 *
 * 09/10/2026. Sorti de `app/api/rendez-vous/route.ts`, où ces gabarits vivaient au
 * milieu de la logique de réservation. Deux raisons, et la seconde est la vraie :
 *
 *   — une route est un TRANSPORT : elle valide, elle écrit en base, elle envoie. Ce
 *     qu'il y a DANS le message n'est pas de son ressort ;
 *   — et surtout : un fichier de route Next.js ne peut rien exporter d'autre que ses
 *     verbes HTTP. Tant que les gabarits y vivaient, PERSONNE ne pouvait les rendre
 *     ailleurs — donc personne ne pouvait les REGARDER sans envoyer un vrai courriel
 *     à quelqu'un. Or on ne livre pas un message qu'on n'a pas vu : des bulletins de
 *     paie sont déjà partis blancs parce qu'on s'était contenté d'en lire le texte.
 *
 * ── POURQUOI CES COURRIELS N'UTILISENT PAS `gabaritEmail()` ────────────────────
 * 09/10/2026, demande d'Arudhan devant le premier rendu : « prends les couleurs du
 * site ». `gabaritEmail()` peint un bandeau `#2F72DE` — un bleu qui n'existe NULLE
 * PART sur mystoryformation.fr — et son pied légal est incomplet (ni RCS, ni siège,
 * ni TVA, cf. `blocLegalComplet()`). Le reprendre toucherait sa quarantaine
 * d'appelants : c'est un chantier à part. Ces deux messages ont donc leur propre
 * coquille, à la charte réelle, et un seul pied — celui qui est conforme.
 *
 * ── ⚠️ CE QU'ON NE PEUT PAS FAIRE DANS UN COURRIEL ─────────────────────────────
 * Ces contraintes priment sur l'esthétique, et elles expliquent le code qui suit :
 *   — NI FLEXBOX NI GRILLE, ni feuille de style externe : Gmail, Outlook et Apple
 *     Mail ne les suivent pas. Des TABLEAUX et des styles EN LIGNE, partout ;
 *   — les polices Google NE SE CHARGENT PAS dans la plupart des clients. Inter et
 *     Poppins sont déclarées en tête de pile, suivies de la pile système : le
 *     message doit être beau SANS elles ;
 *   — Outlook ignore `background-color` sur beaucoup d'éléments. La lisibilité ne
 *     repose donc jamais sur un fond : texte foncé sur clair par défaut, et les
 *     rares aplats portent aussi un attribut `bgcolor` que, lui, Outlook respecte.
 *
 * ── ⚠️ TOUT CE QUI VIENT DU CANDIDAT PASSE PAR `ech()` ─────────────────────────
 * Sans exception, et les objets par `enTete()` : un retour chariot dans un en-tête
 * permet d'en injecter d'autres, `Bcc:` compris. L'échappement HTML ne protège pas
 * de ça — il faut les deux.
 */
import { ech, enTete } from "@/lib/html";
import { blocLegalComplet } from "@/lib/identiteLegale";
import {
  jourLisible, heureLisible, libelleMotif, libelleObjectif,
  DUREE_RDV_MINUTES, DELAI_CONFIRMATION_HEURES,
} from "@/lib/rendezVous";

const TEL = "06 81 43 16 54";
const TEL_LIEN = "+33681431654";

/* ─────────────────────────────────────────────────────────────────────────────
   LA CHARTE — un seul endroit
   ─────────────────────────────────────────────────────────────────────────────
   Relevée dans `mystorywebsite/src/app/globals.css`, bloc `@theme inline`. Trois
   copies de ces valeurs divergeraient le jour d'un changement de charte : les
   gabarits ci-dessous ne lisent que ces constantes, jamais une couleur en dur.

   La règle d'EMPLOI compte autant que les valeurs, et elle vient du site :
   **le marine porte les surfaces, le rouge est réservé à l'action.** Sur
   mystoryformation.fr, le rouge n'apparaît que sur un filet sous le titre, une
   pastille et un bouton. Du rouge ailleurs détruirait l'effet.
   ───────────────────────────────────────────────────────────────────────────── */
const C = {
  marine950: "#051428",
  marine900: "#0a2444",
  marine800: "#0e2d5c",
  marine700: "#14375e",
  marine500: "#2861a0",
  marine100: "#c8d5ec",
  marine50: "#eaeff7",
  rouge500: "#e1192c",
  rouge700: "#9a0a1b",
  rouge50: "#feeaec",
  gris900: "#212529",
  gris700: "#495057",
  gris600: "#868e96",
  gris300: "#dee2e6",
  gris200: "#e9ecef",
  gris100: "#f1f3f5",
  gris50: "#f8f9fa",
  blanc: "#ffffff",
};

/** Inter d'abord, puis la pile système : le message doit tenir sans la police. */
const TEXTE = `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
/** Poppins porte les titres sur le site (`--font-heading`). Même repli. */
const TITRE = `'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

/**
 * La coquille commune : bandeau marine, filet rouge, carte blanche, pied légal.
 *
 * Tout est en tableaux et en styles en ligne — voir l'en-tête du fichier. La
 * largeur est fixée à 600 px, la seule que tous les clients rendent sans surprise,
 * et `width:100%` au-dessus pour qu'elle rétrécisse sur un téléphone.
 */
function coquille(surtitre: string, titre: string, corps: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${ech(titre)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.gris100};font-family:${TEXTE};color:${C.gris900};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.gris100}" style="background-color:${C.gris100};margin:0;padding:0">
  <tr><td align="center" style="padding:24px 12px">

    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

      <!-- Bandeau marine. Le filet rouge sous le titre est la signature du site. -->
      <tr><td bgcolor="${C.marine900}" style="background-color:${C.marine900};border-radius:14px 14px 0 0;padding:26px 28px 24px">
        <p style="margin:0;font-family:${TEXTE};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.marine100}">
          MYSTORY FORMATION
        </p>
        <h1 style="margin:8px 0 0;font-family:${TITRE};font-size:24px;line-height:1.25;font-weight:bold;color:${C.blanc}">
          ${ech(titre)}
        </h1>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">
          <tr><td bgcolor="${C.rouge500}" height="4" style="background-color:${C.rouge500};width:56px;height:4px;line-height:4px;font-size:0;border-radius:2px">&nbsp;</td></tr>
        </table>
        <p style="margin:14px 0 0;font-family:${TEXTE};font-size:14px;line-height:1.5;color:${C.marine100}">
          ${ech(surtitre)}
        </p>
      </td></tr>

      <!-- Le contenu. Fond blanc, texte foncé : lisible même si Outlook mange le fond. -->
      <tr><td bgcolor="${C.blanc}" style="background-color:${C.blanc};padding:26px 28px;border-left:1px solid ${C.gris200};border-right:1px solid ${C.gris200};font-family:${TEXTE};font-size:15px;line-height:1.6;color:${C.gris900}">
        ${corps}
      </td></tr>

      <!-- Pied légal — art. R. 123-237 du code de commerce. Un seul, et conforme. -->
      <tr><td bgcolor="${C.gris50}" style="background-color:${C.gris50};padding:18px 28px 22px;border:1px solid ${C.gris200};border-top:0;border-radius:0 0 14px 14px;font-family:${TEXTE};font-size:11px;line-height:1.6;color:${C.gris600}">
        <p style="margin:0 0 8px;color:${C.gris700};font-size:12px">
          <b>Gagny</b> 3 bis av. de Gagny, 93220 &nbsp;·&nbsp;
          <b>Sarcelles</b> 18 av. du 8 Mai 1945, 95200 &nbsp;·&nbsp;
          <b>Rosny-sous-Bois</b> 46 bis rue d'Estienne d'Orves, 93110<br>
          ${TEL} &nbsp;·&nbsp; contact@mystoryformation.fr &nbsp;·&nbsp; mystoryformation.fr
        </p>
        <p style="margin:0 0 8px">${ech(blocLegalComplet())}</p>
        <p style="margin:0">
          Vos données sont traitées par MY STORY (responsable de traitement) pour la gestion de votre
          rendez-vous, conservées 5 ans et jamais cédées. Droit d'accès, de rectification et d'effacement :
          contact@mystoryformation.fr. <a href="https://www.mystoryformation.fr/politique-de-confidentialite" style="color:${C.gris600}">Politique de confidentialité</a>.
          Médiateur de la consommation : CM2C (cm2c.net).
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Une ligne « Libellé : valeur ». Valeur TOUJOURS échappée.
 *
 * `white-space:nowrap` sur le libellé et rien sur la valeur : c'est elle qui doit
 * revenir à la ligne sur un téléphone, pas l'étiquette.
 */
function ligne(libelle: string, valeur: string): string {
  return `<tr>
    <td style="padding:7px 14px 7px 0;font-family:${TEXTE};font-size:12.5px;color:${C.gris600};vertical-align:top;white-space:nowrap">${libelle}</td>
    <td style="padding:7px 0;font-family:${TEXTE};font-size:14.5px;color:${C.gris900};font-weight:bold">${ech(valeur)}</td>
  </tr>`;
}

/** Un encadré d'alerte. `bgcolor` en plus du style : Outlook n'écoute que lui. */
function encadre(fond: string, bord: string, couleurTexte: string, html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
    <tr><td bgcolor="${fond}" style="background-color:${fond};border-left:4px solid ${bord};border-radius:0 8px 8px 0;padding:12px 14px;font-family:${TEXTE};font-size:13.5px;line-height:1.55;color:${couleurTexte}">
      ${html}
    </td></tr>
  </table>`;
}

/** Un intertitre de section, dans la police des titres. */
function intertitre(t: string): string {
  return `<p style="margin:20px 0 4px;font-family:${TITRE};font-size:13px;font-weight:bold;color:${C.marine800}">${ech(t)}</p>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   1. LE RÉCAPITULATIF INTERNE — dense, pas joli
   ─────────────────────────────────────────────────────────────────────────────
   Il part à `secretariat@`. Il se lit EN DIAGONALE, entre deux candidats, sur un
   téléphone : le créneau et le lieu d'abord (c'est ce qu'on note dans l'agenda),
   puis qui vient, puis ce qu'il faut préparer. Les alertes sont en haut, parce
   qu'une alerte qu'il faut faire défiler n'est pas une alerte.
   ───────────────────────────────────────────────────────────────────────────── */

export function objetRecapInterne(c: Contexte): string {
  return enTete(
    `Rendez-vous réservé en ligne — ${c.nom.toUpperCase()} ${c.prenom} · ${c.agence.nom} · ` +
    `${jourLisible(c.date)} à ${heureLisible(c.heure)}`,
  );
}

export function htmlRecapInterne(c: Contexte): string {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;

  /* ☎️ À APPELER : le budget d'envois est atteint, le candidat n'a RIEN reçu et son
     créneau se rendra tout seul. Rouge, et tout en haut. */
  const alerteRappel = c.aRappeler
    ? encadre(C.rouge50, C.rouge500, C.rouge700,
        `<b>☎️ À APPELER — le candidat n'a reçu aucun message de notre part.</b><br>
         Le budget d'envois automatiques est atteint pour aujourd'hui (garde-fou anti-abus).
         Son créneau est retenu mais sera rendu dans ${DELAI_CONFIRMATION_HEURES} h faute de
         confirmation : appelez-le pour le confirmer, et signalez-le à la direction —
         ce plafond ne s'atteint pas en temps normal.`)
    : "";

  /* En attente de confirmation : gris, c'est une information, pas une alarme. */
  const alerteConfirmation = c.lienConfirmer
    ? encadre(C.gris100, C.gris300, C.gris700,
        `⏳ <b>Adresse pas encore confirmée.</b> Un lien lui a été envoyé. Sans clic de sa part
         sous ${DELAI_CONFIRMATION_HEURES} h, le créneau est automatiquement rendu. Si vous
         l'avez au téléphone et que le rendez-vous est sûr, dites-le-lui : un clic suffit.`)
    : "";

  /* Les examens ont lieu à Rosny UNIQUEMENT. Quelqu'un qui vient « seulement passer
     l'examen » à Gagny ou à Sarcelles doit être redirigé AVANT de se déplacer. */
  const alerteExamen =
    c.objectif === "examen" && !c.agence.centreExamen
      ? encadre(C.rouge50, C.rouge500, C.rouge700,
          `⚠️ Il vient « seulement passer l'examen » mais a choisi <b>${ech(c.agence.nom)}</b>, qui est
           un centre de <b>formation</b>. Les examens se passent uniquement à Rosny-sous-Bois :
           à lui dire au rappel.`)
      : "";

  return coquille(
    "Réservé seul depuis mystoryformation.fr/rendez-vous — la place est prise, rien à confirmer de notre côté.",
    "Rendez-vous pris sur le site",
    `${alerteRappel}${alerteExamen}${alerteConfirmation}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
       ${ligne("Quand", `${quand} (${DUREE_RDV_MINUTES} min)`)}
       ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
       ${ligne("Qui", `${c.civilite ? c.civilite + " " : ""}${c.nom.toUpperCase()} ${c.prenom}`)}
       ${ligne("Téléphone", c.telephone)}
       ${ligne("E-mail", c.email)}
       ${c.motif ? ligne("Sa démarche", libelleMotif(c.motif) ?? c.motif) : ""}
       ${c.objectif ? ligne("Ce qu'il cherche", libelleObjectif(c.objectif) ?? c.objectif) : ""}
       ${ligne("Titre de séjour", c.situation.option)}
     </table>

     ${intertitre("Marche à suivre qui lui a été indiquée")}
     <p style="margin:0;font-size:13.5px;line-height:1.55;color:${C.gris700}">${ech(c.situation.marcheASuivre)}</p>

     ${intertitre("Ce qu'il doit apporter (nous le lui avons écrit)")}
     <p style="margin:0;font-size:13.5px;line-height:1.55;color:${C.gris700}">${ech(c.situation.aApporter)}</p>

     ${c.message
        ? `${intertitre("Son message")}
           <p style="margin:0;font-size:13.5px;line-height:1.55;color:${C.gris700};white-space:pre-wrap">${ech(c.message)}</p>`
        : ""}

     <p style="margin:22px 0 0;font-size:11px;color:${C.gris600}">Rendez-vous ${ech(c.ref)}</p>`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. LA CONFIRMATION AU CANDIDAT — le premier document MYSTORY qu'il reçoit
   ─────────────────────────────────────────────────────────────────────────────
   Elle part de `contact@`, et c'est celle qui doit donner envie. Mais elle a
   d'abord un travail à faire : obtenir le clic, puis redire l'adresse EXACTE (nos
   trois centres se confondent facilement) et CE QU'IL FAUT APPORTER. Un candidat
   qui vient sans sa carte repart avec un second rendez-vous — deux créneaux
   occupés pour un seul dossier.
   ───────────────────────────────────────────────────────────────────────────── */

export function objetConfirmationCandidat(c: Contexte): string {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;
  return enTete(
    c.lienConfirmer
      ? `Confirmez votre rendez-vous MYSTORY — ${quand}, ${c.agence.nom}`
      : `Votre rendez-vous MYSTORY — ${quand}, ${c.agence.nom}`,
  );
}

export function htmlConfirmationCandidat(c: Contexte): string {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;

  /* LE BOUTON. Rouge, parce que sur le site le rouge EST l'action — et parce qu'il
     n'y a qu'une seule chose à faire dans ce message.
     Construit en tableau avec `bgcolor` : un `<a>` à `background-color` seule perd
     sa couleur dans Outlook et devient un lien bleu souligné illisible sur fond
     clair. Le lien en clair juste dessous est le filet pour les clients qui
     n'affichent aucun fond du tout — une ligne de texte vaut mieux qu'un bouton
     invisible. */
  const bouton = c.lienConfirmer
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 8px">
         <tr><td bgcolor="${C.rouge500}" align="center" style="background-color:${C.rouge500};border-radius:999px">
           <a href="${ech(c.lienConfirmer)}"
              style="display:inline-block;padding:15px 34px;font-family:${TITRE};font-size:16px;font-weight:bold;color:${C.blanc};text-decoration:none;border-radius:999px">
             Confirmer mon rendez-vous
           </a>
         </td></tr>
       </table>
       <p style="margin:0 0 4px;text-align:center;font-size:12px;color:${C.gris600}">
         Sans confirmation sous ${DELAI_CONFIRMATION_HEURES} heures, le créneau repart à quelqu'un d'autre.
       </p>
       <p style="margin:0 0 18px;text-align:center;font-size:11px;color:${C.gris600};word-break:break-all">
         Le bouton ne fonctionne pas ? Copiez ce lien :<br>
         <a href="${ech(c.lienConfirmer)}" style="color:${C.marine500}">${ech(c.lienConfirmer)}</a>
       </p>`
    : "";

  return coquille(
    c.lienConfirmer
      ? "Votre créneau est retenu. Il ne manque qu'un clic."
      : "Votre rendez-vous est enregistré. Nous vous attendons.",
    c.lienConfirmer ? "Un clic et c'est confirmé" : "Votre rendez-vous est confirmé",
    `<p style="margin:0 0 12px;font-size:16px">Bonjour ${ech(c.prenom)},</p>

     ${c.lienConfirmer
        ? `<p style="margin:0">Votre créneau est <b>retenu</b>. Il ne manque qu'un clic pour le rendre
             définitif — c'est ce qui nous permet de vérifier que cette adresse est bien la vôtre.</p>
           ${bouton}`
        : `<p style="margin:0 0 16px">Votre rendez-vous est bien enregistré. Vous n'avez rien d'autre à
             faire : nous vous attendons.</p>`}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">
       ${ligne("Quand", quand)}
       ${ligne("Combien de temps", `environ ${DUREE_RDV_MINUTES} minutes`)}
       ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
     </table>

     ${encadre(C.marine50, C.marine500, C.marine900,
        `<b>À apporter :</b> ${ech(c.situation.aApporter)}.`)}

     <p style="margin:0 0 16px;font-size:13.5px;line-height:1.55;color:${C.gris700}">
       ${ech(c.situation.marcheASuivre)}
     </p>

     <p style="margin:0;font-size:13px;line-height:1.6;color:${C.gris600}">
       Un empêchement, une question ? Répondez à ce message, appelez le
       <a href="tel:${TEL_LIEN}" style="color:${C.marine500};font-weight:bold">${TEL}</a>,
       ou <a href="https://wa.me/33681431654" style="color:${C.marine500}">écrivez-nous sur WhatsApp</a>.
       Prévenez-nous si vous ne pouvez pas venir : votre créneau servira à quelqu'un d'autre.
     </p>

     <p style="margin:22px 0 0;font-size:11px;color:${C.gris600}">Référence ${ech(c.ref)}</p>`,
  );
}

export type Contexte = {
  ref: string;
  agence: { code: string; nom: string; adresse: string; centreExamen: boolean };
  date: string; heure: string;
  civilite: string; nom: string; prenom: string; email: string; telephone: string;
  motif: string; objectif: string;
  situation: { id: string; option: string; marcheASuivre: string; aApporter: string };
  message: string;
  /** Lien de confirmation (jeton aléatoire). Vide quand le budget d'envoi est
   *  atteint : aucun courriel ne part alors au candidat. */
  lienConfirmer: string;
  /** Le candidat n'a pas été prévenu : il faut l'appeler. */
  aRappeler: boolean;
};
