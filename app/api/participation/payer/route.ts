/**
 * MYSTORY — POST /api/participation/payer  (PUBLIC, appelé par /participation)
 *
 * Ouvre le paiement Mollie de la participation forfaitaire CPF et renvoie
 * l'adresse de la page de règlement.
 *
 * ── 🔴 LE MONTANT NE VIENT JAMAIS DU NAVIGATEUR ─────────────────────────────
 *
 * Il vaut `TICKET_MODERATEUR`, point. Le corps du POST ne porte qu'un jeton :
 * aucun montant ne circule, ni dans l'URL, ni dans le formulaire. C'est la même
 * règle qu'`/api/commande`, et elle n'est pas théorique — un montant accepté du
 * client est un montant choisi par le client.
 *
 * ── 🔴 ET ON REVÉRIFIE QUE C'EST DÛ ─────────────────────────────────────────
 *
 * La page a déjà vérifié, mais entre son affichage et ce clic l'équipe a pu
 * exonérer le candidat ou enregistrer son paiement en espèces. Ouvrir le
 * paiement sans relire l'état, c'est encaisser 150 € non dus sur un financement
 * public — donc une somme à rendre et une anomalie à expliquer pendant un
 * contrôle. La vérification est refaite ICI, à la seconde du clic.
 */
import { NextRequest, NextResponse } from "next/server";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import { creerPaiement, molliePret } from "@/lib/mollie";
import {
  ouvrirLien, contexteDossier, etatParticipation, intituleFormation,
  euros, TICKET_MODERATEUR, PREFIXE_REFERENCE_PARTICIPATION,
} from "@/lib/liensCandidat";
import { journaliser, baseCrm } from "@/lib/liensCandidatPages";
import { TEL_PUBLIC } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true });

  const ip = ipDeConfiance(req);
  if (await limiteDepassee(`participation:payer:ip:${ip}`, 15, 900)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL_PUBLIC}.` },
      { status: 429 },
    );
  }

  const lien = await ouvrirLien(b.j, "participation");
  if (!lien) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}, nous vous en renvoyons un.` },
      { status: 410 },
    );
  }

  const c = await contexteDossier(lien.dossierId);
  if (!c) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 410 },
    );
  }

  /* 🔴 LA REVÉRIFICATION. Entre l'affichage de la page et ce clic, l'équipe a pu
     exonérer le candidat ou encaisser autrement. On ne demande pas d'argent à
     quelqu'un qui n'en doit plus — et on le lui DIT, pour qu'il ne recommence pas. */
  const etat = etatParticipation(c);
  if (etat !== "due") {
    await journaliser("participation_paiement_refuse", lien.dossierId, { etat });
    const message = etat === "reglee"
      ? "Votre participation est déjà enregistrée comme réglée : il n'y a rien à payer. Rechargez la page."
      : etat === "exoneree"
      ? "Votre situation vous exonère de cette participation : il n'y a rien à payer. Rechargez la page."
      : "Votre dossier n'est pas financé par le CPF : cette participation ne vous concerne pas. Rechargez la page.";
    return NextResponse.json({ ok: false, erreur: message }, { status: 409 });
  }

  if (!molliePret()) {
    await journaliser("participation_mollie_absent", lien.dossierId, {});
    return NextResponse.json(
      { ok: false, erreur: `Le paiement en ligne est momentanément indisponible. Appelez-nous au ${TEL_PUBLIC}, nous l'enregistrons autrement.` },
      { status: 503 },
    );
  }

  const base = baseCrm();
  const reference = `${PREFIXE_REFERENCE_PARTICIPATION}${c.dossierId}`;

  try {
    const paiement = await creerPaiement({
      montant: TICKET_MODERATEUR,
      // 200 caractères max chez Mollie, et c'est ce que le candidat lit sur son relevé :
      // il doit y reconnaître MYSTORY et l'objet, pas un code interne.
      description: `MYSTORY — participation CPF ${euros(TICKET_MODERATEUR)} — ${c.prenom} ${c.nom}`,
      reference,
      email: c.email || undefined,
      // Le candidat revient sur SA page : elle relira l'état en base et affichera le reçu
      // ou l'attente. `?retour=attente` n'affirme rien — seul le webhook fait foi.
      urlRetour: `${base}/participation/merci?j=${encodeURIComponent(String(b.j ?? ""))}`,
      urlWebhook: `${base}/api/participation/paiement`,
      /* `lignes` et `adresse` sont ce qui fait APPARAÎTRE Klarna chez Mollie (voir
         lib/mollie.ts). Ils sont passés ici parce qu'ils ne coûtent rien — mais
         la somme des lignes doit tomber EXACTEMENT sur le total, et c'est le cas :
         une seule ligne au montant du ticket modérateur. */
      lignes: [{ libelle: `Participation forfaitaire CPF — ${intituleFormation(c)}`, prix: TICKET_MODERATEUR }],
      adresse: {
        prenom: c.prenom, nom: c.nom, email: c.email,
        adresse: c.adresse, codePostal: c.cp, ville: c.ville, pays: "France",
      },
    });

    await journaliser("participation_paiement_ouvert", lien.dossierId, {
      paiement: paiement.id, montant: TICKET_MODERATEUR, reference,
    });

    return NextResponse.json({ ok: true, paiement: paiement.url });
  } catch (e) {
    await journaliser("participation_paiement_echec", lien.dossierId, {
      erreur: e instanceof Error ? e.message : "inconnue",
    });
    return NextResponse.json(
      { ok: false, erreur: `Le paiement n'a pas pu être ouvert. Appelez-nous au ${TEL_PUBLIC}, nous finalisons avec vous.` },
      { status: 502 },
    );
  }
}
