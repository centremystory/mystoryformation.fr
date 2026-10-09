/**
 * MYSTORY — POST /api/participation/exoneration  (PUBLIC, appelé par /participation)
 *
 * Enregistre la DEMANDE d'un candidat qui pense ne pas devoir la participation
 * forfaitaire, et prévient le secrétariat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CETTE ROUTE N'EXONÈRE PERSONNE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Elle écrit `exoneration_demandee_le` et `exoneration_demandee_motif`. Elle ne
 * touche JAMAIS `participation_forfaitaire_exemptee`, qui reste la décision de
 * l'équipe sur justificatif (attestation France Travail, accord de l'OPCO…).
 *
 * La tentation est pourtant forte : le candidat déclare être demandeur d'emploi,
 * et c'est effectivement un motif d'exonération — alors pourquoi ne pas cocher
 * la case tout de suite ? Parce que la déclaration n'est pas la preuve. Exonérer
 * sur déclaration, c'est transformer 150 € dus en 150 € jamais encaissés, sur un
 * dossier financé par la Caisse des dépôts, et sans aucune pièce au dossier pour
 * l'expliquer. Ça se voit au premier contrôle, et ça se voit sur chaque dossier
 * à la fois.
 *
 * Ce que la route fait de vraiment utile : elle SUSPEND la réclamation. Le
 * secrétariat est prévenu, le candidat voit « votre demande est enregistrée, ne
 * payez rien en attendant », et personne ne lui réclame 150 € pendant qu'on
 * vérifie.
 *
 * ── CE QUE ÇA SUPPRIME ──────────────────────────────────────────────────────
 *
 * Aujourd'hui : le candidat appelle, quelqu'un décroche, note le motif dans un
 * champ libre, et coche « exonéré » en croyant l'appelant. Ici le motif arrive
 * dans une valeur fermée (trois choix), la demande est horodatée, et
 * l'exonération reste un geste conscient pris sur pièce.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import {
  ouvrirLien, contexteDossier, marquerUtilise, etatParticipation,
  euros, TICKET_MODERATEUR,
} from "@/lib/liensCandidat";
import { journaliser, prevenirSecretariat, ligneInterne } from "@/lib/liensCandidatPages";
import { TEL_PUBLIC } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les trois motifs, en valeurs FERMÉES.
 *
 * Pas de champ libre, et ce n'est pas de la paresse d'interface : le relevé du
 * 09/10/2026 montre que les surfaces de texte libre de ce CRM sont vides
 * (`taches`, `remarques`, `messages_internes`, `reclamations` : 0 ligne). Un
 * motif tapé par un candidat sur un téléphone serait illisible et
 * inexploitable ; trois valeurs se trient et se comptent.
 *
 * ⚠️ Le libellé décrit ce qu'il faut VÉRIFIER, parce que c'est ce que le
 * secrétariat doit faire ensuite. « autre » n'invente rien : il demande un
 * rappel.
 */
const MOTIFS: Record<string, string> = {
  france_travail: "Demandeur d'emploi inscrit à France Travail — demander l'attestation d'inscription",
  employeur: "Employeur ou financeur (OPCO, région) prend le relais — vérifier auprès du financeur",
  autre: "Autre situation — le candidat demande à être rappelé",
};

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true });

  const ip = ipDeConfiance(req);
  if (await limiteDepassee(`participation:exo:ip:${ip}`, 15, 900)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL_PUBLIC}.` },
      { status: 429 },
    );
  }

  const lien = await ouvrirLien(b.j, "participation");
  if (!lien) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 410 },
    );
  }

  const motif = String(b.motif ?? "").trim();
  if (!MOTIFS[motif]) {
    return NextResponse.json({ ok: false, erreur: "Choisissez une des situations proposées." }, { status: 400 });
  }

  const c = await contexteDossier(lien.dossierId);
  if (!c) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 410 },
    );
  }

  /* Rien à demander si rien n'est dû : le candidat est déjà exonéré, déjà à jour,
     ou hors CPF. On répond ok — sa préoccupation est satisfaite, la page le lui
     dira au rechargement — sans écrire une demande qui n'a pas d'objet. */
  const etat = etatParticipation(c);
  if (etat !== "due") {
    await journaliser("participation_exoneration_sans_objet", lien.dossierId, { etat, motif });
    return NextResponse.json({ ok: true, sansObjet: true });
  }

  const maintenant = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("dossiers")
    .update({
      exoneration_demandee_le: maintenant,
      exoneration_demandee_motif: MOTIFS[motif],
      /* 🔴 `participation_forfaitaire_exemptee` N'EST PAS TOUCHÉ. Voir l'en-tête :
         une déclaration n'est pas une preuve, et l'exonération reste un geste
         d'équipe pris sur justificatif. */
    })
    .eq("id", lien.dossierId);

  if (error) {
    await journaliser("participation_exoneration_echec", lien.dossierId, { motif, erreur: error.message });
    return NextResponse.json(
      { ok: false, erreur: `Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 500 },
    );
  }

  await marquerUtilise(lien.id);

  const nom = `${c.prenom} ${c.nom}`.trim();
  const envoi = await prevenirSecretariat(
    `Exonération DEMANDÉE — ${nom} · ${euros(TICKET_MODERATEUR)} en attente`,
    "Demande d'exonération de la participation CPF",
    `<p>Le candidat déclare ne pas devoir la participation forfaitaire de
     <b>${euros(TICKET_MODERATEUR)}</b>. <b>Rien n'a été exonéré automatiquement</b> : la demande
     est enregistrée, à vous de vérifier sur justificatif.</p>
     ${ligneInterne("Candidat", nom)}
     ${ligneInterne("Motif déclaré", MOTIFS[motif])}
     ${ligneInterne("Téléphone", c.telephone)}
     ${ligneInterne("E-mail", c.email)}
     ${ligneInterne("N° dossier EDOF", c.numeroEdof)}
     ${ligneInterne("Montant de la formation", euros(c.montant))}
     <p style="margin-top:14px"><b>À faire :</b> vérifier la situation, puis cocher
     « participation exonérée » sur la fiche du dossier (avec le motif) si c'est justifié — ou
     rappeler le candidat pour lui expliquer qu'il doit régler.</p>
     <p><b>Ne pas relancer le paiement tant que ce n'est pas tranché</b> : la page indique au
     candidat de ne rien payer en attendant.</p>`,
    lien.dossierId,
  );

  await journaliser("participation_exoneration_demandee", lien.dossierId, {
    motif, secretariat_prevenu: envoi.ok, secretariat_erreur: envoi.erreur ?? null,
  });

  return NextResponse.json({ ok: true });
}
