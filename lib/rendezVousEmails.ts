/**
 * MYSTORY — le contenu des courriels de rendez-vous. Objets et HTML, rien d'autre.
 *
 * 09/10/2026. Sorti de `app/api/rendez-vous/route.ts`, où ces deux gabarits vivaient
 * au milieu de la logique de réservation. Deux raisons, et la seconde est la vraie :
 *
 *   — une route est un TRANSPORT : elle valide, elle écrit en base, elle envoie. Ce
 *     qu'il y a DANS le message n'est pas de son ressort ;
 *   — et surtout : un fichier de route Next.js ne peut rien exporter d'autre que ses
 *     verbes HTTP. Tant que les gabarits y vivaient, PERSONNE ne pouvait les rendre
 *     ailleurs — donc personne ne pouvait les REGARDER sans envoyer un vrai courriel
 *     à quelqu'un. Or on ne livre pas un message qu'on n'a pas vu : des bulletins de
 *     paie sont déjà partis blancs parce qu'on s'était contenté d'en lire le texte.
 *
 * ⚠️ TOUT CE QUI VIENT DU CANDIDAT PASSE PAR `ech()`, sans exception, et les objets
 * par `enTete()` (un retour chariot dans un en-tête permet d'en injecter d'autres,
 * `Bcc:` compris — l'échappement HTML ne protège pas de ça, il faut les deux).
 */
import { gabaritEmail } from "@/lib/email";
import { ech, enTete } from "@/lib/html";
import { blocLegalComplet } from "@/lib/identiteLegale";
import {
  jourLisible, heureLisible, libelleMotif, libelleObjectif,
  DUREE_RDV_MINUTES, DELAI_CONFIRMATION_HEURES,
} from "@/lib/rendezVous";

const TEL = "06 81 43 16 54";

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

/**
 * Le pied légal conforme, en HTML.
 *
 * ⚠️ Il s'AJOUTE au pied de `gabaritEmail()`, qui est incomplet (ni RCS, ni siège,
 * ni TVA — cf. `blocLegalComplet()` dans lib/identiteLegale.ts). Reprendre le
 * gabarit lui-même touche une quarantaine d'appelants : c'est un chantier à part.
 * En attendant, mieux vaut un bloc conforme en double qu'un bloc incomplet seul.
 */
function piedConforme(): string {
  return `<p style="margin-top:18px;padding-top:12px;border-top:1px solid #e6e9f0;color:#8a919d;font-size:11px;line-height:1.5">
    ${ech(blocLegalComplet())}
  </p>`;
}

/** Une ligne « Libellé : valeur » du tableau récapitulatif. Valeur toujours échappée. */
function ligne(libelle: string, valeur: string): string {
  return `<tr>
    <td style="padding:6px 10px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${libelle}</td>
    <td style="padding:6px 0;color:#1f2430;font-size:14px"><b>${ech(valeur)}</b></td>
  </tr>`;
}

/**
 * « on reçoit un mail recap juste » — exactement ça, et rien de plus.
 *
 * L'ordre des lignes n'est pas décoratif : le créneau et le lieu d'abord (c'est ce
 * qu'on note dans l'agenda), puis qui vient, puis ce qu'il faut préparer. Quelqu'un
 * qui lit ce message sur son téléphone, entre deux candidats, doit savoir en une
 * seconde QUAND et OÙ. Le reste peut attendre la deuxième ligne.
 */
export function objetRecapInterne(c: Contexte): string {
  return enTete(
    `Rendez-vous réservé en ligne — ${c.nom.toUpperCase()} ${c.prenom} · ${c.agence.nom} · ` +
    `${jourLisible(c.date)} à ${heureLisible(c.heure)}`,
  );
}

export function htmlRecapInterne(c: Contexte): string {
  const quand = `${jourLisible(c.date)} à ${heureLisible(c.heure)}`;

  // Alerte utile, et uniquement quand elle sert : les examens ont lieu à Rosny
  // seulement. Quelqu'un qui vient « seulement passer l'examen » à Gagny ou à
  // Sarcelles doit être redirigé AVANT de se déplacer.
  const alerteExamen =
    c.objectif === "examen" && !c.agence.centreExamen
      ? `<p style="background:#fff4e5;border-left:3px solid #f59e0b;padding:10px 12px;border-radius:6px;font-size:13px">
           ⚠️ Il vient « seulement passer l'examen » mais a choisi <b>${ech(c.agence.nom)}</b>, qui est un centre
           de <b>formation</b>. Les examens se passent uniquement à Rosny-sous-Bois : à lui dire au rappel.
         </p>`
      : "";

  return gabaritEmail(
      "Rendez-vous pris sur le site",
      `<p style="font-size:15px;margin-top:0">Un candidat a réservé seul son rendez-vous sur
        <b>mystoryformation.fr/rendez-vous</b>. Rien à faire de notre côté : la place est prise.</p>

       ${c.aRappeler
          ? `<p style="background:#fde8e8;border-left:3px solid #dc2626;padding:10px 12px;border-radius:6px;font-size:13px;color:#7f1d1d">
               ☎️ <b>À APPELER — le candidat n'a reçu aucun message de notre part.</b>
               Le budget d'envois automatiques est atteint pour aujourd'hui (garde-fou
               anti-abus). Son créneau est retenu mais sera rendu dans
               ${DELAI_CONFIRMATION_HEURES} h faute de confirmation : appelez-le pour
               le confirmer, et signalez-le à la direction — ce plafond ne s'atteint
               pas en temps normal.
             </p>`
          : ""}

       ${c.lienConfirmer
          ? `<p style="background:#f4f6fb;border-left:3px solid #9aa1ad;padding:10px 12px;border-radius:6px;font-size:12.5px;color:#4b5563">
               ⏳ <b>Adresse pas encore confirmée.</b> Un lien de confirmation lui a été envoyé.
               Sans clic de sa part sous ${DELAI_CONFIRMATION_HEURES} h, le créneau est automatiquement
               rendu et il faudra le reprendre avec lui. Si vous l'avez au téléphone et que le
               rendez-vous est sûr, dites-le-lui : un clic suffit.
             </p>`
          : ""}

       <table style="border-collapse:collapse;width:100%">
         ${ligne("Quand", `${quand} (${DUREE_RDV_MINUTES} min)`)}
         ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
         ${ligne("Qui", `${c.civilite ? c.civilite + " " : ""}${c.nom.toUpperCase()} ${c.prenom}`)}
         ${ligne("Téléphone", c.telephone)}
         ${ligne("E-mail", c.email)}
         ${c.motif ? ligne("Sa démarche", libelleMotif(c.motif) ?? c.motif) : ""}
         ${c.objectif ? ligne("Ce qu'il cherche", libelleObjectif(c.objectif) ?? c.objectif) : ""}
         ${ligne("Titre de séjour", c.situation.option)}
       </table>

       ${alerteExamen}

       <p style="font-size:13px;margin-bottom:4px"><b>Marche à suivre qui lui a été indiquée</b></p>
       <p style="font-size:13px;color:#4b5563;margin-top:0">${ech(c.situation.marcheASuivre)}</p>

       <p style="font-size:13px;margin-bottom:4px"><b>Ce qu'il doit apporter</b> (nous le lui avons écrit)</p>
       <p style="font-size:13px;color:#4b5563;margin-top:0">${ech(c.situation.aApporter)}</p>

       ${c.message
          ? `<p style="font-size:13px;margin-bottom:4px"><b>Son message</b></p>
             <p style="font-size:13px;color:#4b5563;margin-top:0;white-space:pre-wrap">${ech(c.message)}</p>`
          : ""}

       <p style="color:#9aa1ad;font-size:11px;margin-top:16px">Rendez-vous ${ech(c.ref)}</p>
       ${piedConforme()}`,
  );
}

/**
 * La confirmation au candidat.
 *
 * Elle ne sert pas à faire joli : elle lui redit l'adresse EXACTE (nos trois centres
 * se confondent facilement) et ce qu'il doit apporter. Un candidat qui vient sans sa
 * carte repart avec un second rendez-vous — et nous avons occupé deux créneaux pour
 * un seul dossier.
 *
 * Le lien WhatsApp y figure, discrètement, pour une question. Jamais comme chemin
 * principal : il a déjà réservé, il n'y a plus rien à négocier.
 */
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
  return gabaritEmail(
      c.lienConfirmer ? "Un clic et c'est confirmé" : "Votre rendez-vous est confirmé",
      `<p style="font-size:15px;margin-top:0">Bonjour ${ech(c.prenom)},</p>
       ${c.lienConfirmer
          ? `<p>Votre créneau est <b>retenu</b>. Il ne manque qu'un clic pour le rendre définitif —
               c'est ce qui nous permet de vérifier que cette adresse est bien la vôtre.</p>
             <p style="text-align:center;margin:22px 0">
               <a href="${ech(c.lienConfirmer)}"
                  style="display:inline-block;background:#2F72DE;color:#ffffff;text-decoration:none;
                         padding:14px 28px;border-radius:999px;font-size:15px;font-weight:bold">
                 Confirmer mon rendez-vous
               </a>
             </p>
             <p style="font-size:12.5px;color:#6b7280;text-align:center;margin-top:-8px">
               Sans confirmation sous ${DELAI_CONFIRMATION_HEURES} heures, le créneau est rendu à
               quelqu'un d'autre.
             </p>`
          : `<p>Votre rendez-vous est bien enregistré. Vous n'avez rien d'autre à faire :
               nous vous attendons.</p>`}

       <table style="border-collapse:collapse;width:100%">
         ${ligne("Quand", `${quand}`)}
         ${ligne("Combien de temps", `environ ${DUREE_RDV_MINUTES} minutes`)}
         ${ligne("Où", `${c.agence.nom} — ${c.agence.adresse}`)}
       </table>

       <p style="background:#eef3fd;border-left:3px solid #2F72DE;padding:12px 14px;border-radius:6px;font-size:14px">
         <b>À apporter :</b> ${ech(c.situation.aApporter)}.
       </p>

       <p style="font-size:13px;color:#4b5563">${ech(c.situation.marcheASuivre)}</p>

       <p style="font-size:13px;color:#6b7280">Un empêchement, une question&nbsp;?
         Écrivez-nous en répondant à ce message, appelez le ${TEL}, ou
         <a href="https://wa.me/33681431654" style="color:#2F72DE">écrivez-nous sur WhatsApp</a>.
         Prévenez-nous si vous ne pouvez pas venir&nbsp;: votre créneau servira à quelqu'un d'autre.</p>

       <p style="color:#9aa1ad;font-size:11px;margin-top:16px">Référence ${ech(c.ref)}</p>
       ${piedConforme()}`,
  );
}
