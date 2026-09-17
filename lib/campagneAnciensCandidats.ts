/**
 * MYSTORY — Campagne « vous avez passé votre examen chez nous ».
 *
 * 17/09/2026. 1 064 personnes ont passé un examen chez nous entre février et
 * septembre 2026. Aucune ne s'est vu proposer la suite : ni félicitations, ni
 * seconde chance, ni test de niveau. Cette campagne les rappelle, une fois.
 *
 * ── POURQUOI UN SEUL MESSAGE, SANS FÉLICITATIONS NOMINATIVES ──
 *
 * L'intention de départ était de féliciter ceux qui ont réussi et d'encourager
 * ceux qui ont échoué. C'est impossible : LE RÉSULTAT DES EXAMENS N'EST NULLE
 * PART. La table `resultats_examen` est vide, et le tableur de suivi n'a pas de
 * colonne de résultat — ses deux colonnes « Résultat » portent sur les demandes
 * de correction et les remboursements.
 *
 * Deviner serait pire que se taire : écrire « félicitations pour votre réussite »
 * à quelqu'un qui a échoué est le genre de message qui fait perdre un client pour
 * de bon, et qui se raconte. Le message reconnaît donc les deux issues sans
 * présumer de celle du lecteur — ce qui est exactement la formulation qu'Arudhan
 * avait lui-même employée : « j'espère que vous avez réussi, sinon ce n'est pas
 * grave ».
 *
 * ── POURQUOI PAR LOTS ──
 *
 * 1 064 messages envoyés d'un coup depuis une boîte IONOS, c'est le meilleur
 * moyen de faire classer le domaine en expéditeur de masse. Le jour où cela
 * arrive, ce ne sont pas les campagnes qui tombent : ce sont les CONVOCATIONS.
 * L'envoi se fait donc par lots, avec une pause entre chaque message.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { lienDesinscription } from "@/lib/desinscription";

export const CAMPAGNE = "anciens-candidats-2026-09";

const TEST_URL = "https://test.mystoryformation.fr";
const SESSIONS_URL = "https://www.mystoryformation.fr/prochaines-sessions-examen";

export type Destinataire = { email: string; prenom: string | null };

/**
 * Les personnes à qui écrire : un examen passé, une adresse plausible, pas encore
 * écrit dans cette campagne, pas désinscrite.
 *
 * L'exclusion des désinscrits se fait ICI, à chaque lot, et non une fois pour
 * toutes : quelqu'un qui se désinscrit après avoir reçu le lot 1 ne doit pas
 * recevoir le lot 2.
 */
export async function destinataires(limite: number): Promise<Destinataire[]> {
  const { data: examens } = await supabaseAdmin
    .from("examens")
    .select("email, prenom, date_examen")
    .eq("actif", true)
    .lt("date_examen", new Date().toISOString().slice(0, 10))
    .order("date_examen", { ascending: false })
    .limit(4000);

  const { data: dejaEcrit } = await supabaseAdmin
    .from("campagnes_envois").select("email").eq("campagne", CAMPAGNE);
  const { data: opposes } = await supabaseAdmin
    .from("desinscriptions").select("email");

  const exclus = new Set<string>([
    ...(dejaEcrit ?? []).map((x: any) => String(x.email).toLowerCase()),
    ...(opposes ?? []).map((x: any) => String(x.email).toLowerCase()),
  ]);

  // Dédoublonnage : une personne qui a passé le TEF ET le civique apparaît deux
  // fois dans la table des examens. Elle ne doit recevoir qu'un seul message.
  const vus = new Map<string, Destinataire>();
  for (const e of (examens ?? []) as any[]) {
    const mail = String(e.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail)) continue;
    if (exclus.has(mail) || vus.has(mail)) continue;
    vus.set(mail, { email: mail, prenom: (e.prenom ?? "").trim() || null });
    if (vus.size >= limite) break;
  }
  return [...vus.values()];
}

/** « Bonjour Marie » — et « Bonjour » tout court quand le prénom manque ou crie. */
function salutation(prenom: string | null): string {
  const p = (prenom ?? "").trim();
  if (!p || p.length > 30) return "Bonjour";
  const propre = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  return `Bonjour ${propre}`;
}

export function corpsMessage(d: Destinataire): string {
  const desinscription = lienDesinscription(d.email);

  return gabaritEmail(
    "Votre examen chez MYSTORY",
    `
<p style="font-size:15px;margin:0 0 16px;">${salutation(d.prenom)},</p>

<p style="font-size:15px;margin:0 0 16px;">
  Vous avez passé votre examen dans l'un de nos centres. Merci de nous avoir fait
  confiance pour un moment qui comptait pour vous.
</p>

<p style="font-size:15px;margin:0 0 18px;">
  <b>Si vous avez obtenu le niveau qu'il vous fallait, bravo — c'est vous qui avez
  travaillé.</b> Et si ce n'était pas cette fois-ci, ce n'est pas grave&nbsp;: beaucoup
  de candidats réussissent au second passage. La différence tient rarement au niveau
  de français. Elle tient à la méthode, et à l'épreuve qui a fait chuter le score.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F6FF;border:1px solid #CFE0FA;border-radius:12px;margin:0 0 18px;">
  <tr><td style="padding:18px 20px;">
    <div style="font-size:17px;font-weight:800;color:#12325f;margin-bottom:8px;">
      Savez-vous où vous en êtes exactement&nbsp;?
    </div>
    <div style="font-size:14px;color:#26384f;line-height:1.6;">
      Notre test de niveau en ligne est <b>gratuit</b> et prend <b>45 minutes</b>.
      Il évalue les quatre compétences, votre écrit et votre oral sont corrigés par
      une formatrice, et vous recevez un bilan par courriel&nbsp;: votre niveau réel,
      l'épreuve à travailler en priorité, et le nombre d'heures qu'il vous faut.
    </div>
  </td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
  <tr><td align="center">
    <a href="${TEST_URL}" style="display:inline-block;background:#2F72DE;color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:10px;font-size:16px;font-weight:700;">Faire mon test gratuit</a>
    <div style="font-size:13px;color:#6b7280;margin-top:9px;">
      Sans rendez-vous, sans carte bancaire, sans engagement.
    </div>
  </td></tr>
</table>

<p style="font-size:14px;color:#3a4759;margin:0 0 14px;line-height:1.6;">
  Après le test, nous vous rappelons pour vous dire franchement ce dont vous avez
  besoin — et parfois que vous n'avez besoin de rien. Une préparation démarre à
  <b>12 heures</b>, et elle est le plus souvent <b>financée par votre compte
  personnel de formation</b>&nbsp;: beaucoup de nos stagiaires n'ont rien à payer.
</p>

<p style="font-size:14px;color:#3a4759;margin:0 0 6px;line-height:1.6;">
  Si vous souhaitez simplement repasser l'examen, nos prochaines dates sont ici&nbsp;:
  <a href="${SESSIONS_URL}" style="color:#2F72DE;">voir les sessions</a>.
  Une question&nbsp;? Répondez à ce message, ou appelez le 06&nbsp;81&nbsp;43&nbsp;16&nbsp;54.
</p>

<p style="font-size:15px;margin:18px 0 0;">
  Bien à vous,<br>
  <b>L'équipe MYSTORY Formation</b>
</p>

<p style="font-size:11px;color:#9aa1ad;margin:20px 0 0;line-height:1.5;">
  Vous recevez ce message parce que vous avez passé un examen dans l'un de nos centres.
  <a href="${desinscription}" style="color:#9aa1ad;">Je ne souhaite plus recevoir ce type de message</a>.
</p>
`,
  );
}

export type Bilan = { envoyes: number; echecs: number; restants: number; details: string[] };

/**
 * Envoie un lot. Renvoie ce qui est parti, ce qui a échoué, et ce qu'il reste.
 *
 * L'écriture dans `campagnes_envois` a lieu AVANT l'envoi : si le processus est
 * interrompu entre les deux, on aura au pire écrit à quelqu'un sans le noter —
 * jamais l'inverse, qui produirait un doublon au lot suivant. Entre deux
 * personnes déjà écrites, une seule est possible grâce à l'index unique.
 */
export async function envoyerLot(taille: number, pauseMs = 1200): Promise<Bilan> {
  const liste = await destinataires(taille);
  const bilan: Bilan = { envoyes: 0, echecs: 0, restants: 0, details: [] };

  for (const d of liste) {
    // Réservation : l'index unique fait échouer une seconde tentative sur la
    // même adresse, ce qui vaut verrou sans avoir à en poser un.
    const { error: eReserve } = await supabaseAdmin
      .from("campagnes_envois")
      .insert({ campagne: CAMPAGNE, email: d.email, destinataire: d.prenom, statut: "en_cours" });
    if (eReserve) continue; // déjà réservée par un autre passage : on saute

    const r = await envoyerEmail({
      a: d.email,
      objet: "Votre examen chez MYSTORY — et la suite, si vous le souhaitez",
      html: corpsMessage(d),
      entite: "campagne",
      entiteId: CAMPAGNE,
    });

    await supabaseAdmin.from("campagnes_envois")
      .update({ statut: r.ok ? "envoye" : "echec", erreur: r.erreur ?? null })
      .eq("campagne", CAMPAGNE).eq("email", d.email);

    if (r.ok) bilan.envoyes++;
    else { bilan.echecs++; bilan.details.push(`${d.email} : ${r.erreur}`); }

    // Une pause entre deux messages : un flux continu depuis une boîte IONOS est
    // ce qui déclenche les limitations, et ce sont les convocations qui tombent.
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
  }

  bilan.restants = (await destinataires(5000)).length;
  return bilan;
}
