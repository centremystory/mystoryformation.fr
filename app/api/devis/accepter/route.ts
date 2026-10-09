/**
 * MYSTORY — POST /api/devis/accepter  (PUBLIC, appelé par /devis)
 *
 * Horodate l'acceptation du devis par le candidat, FIGE ce qu'il avait sous les
 * yeux, journalise, et prévient le secrétariat.
 *
 * ── 🔴 L'INSTANTANÉ EST LE CŒUR DE CETTE ROUTE ──────────────────────────────
 *
 * `devis_accepte_le` seul ne prouve rien d'utile. Un dossier bouge — heures
 * arrêtées après le positionnement, planning décalé, montant qui suit — et six
 * mois plus tard « accepté le 9 octobre » ne dit pas ACCEPTÉ QUOI. La seule
 * réponse disponible serait l'état actuel du dossier, qui n'est pas celui qui a
 * été accepté.
 *
 * On relit donc le dossier ICI, côté serveur, et on range le résultat dans
 * `devis_accepte_vu`. ⚠️ Jamais depuis le corps du POST : le navigateur
 * n'envoie que « j'accepte », et c'est volontaire. Laisser le client décrire ce
 * qu'il accepte, ce serait accepter un montant choisi par le client — le même
 * principe qu'`/api/commande`, où aucun montant ne circule dans l'URL et tout
 * est recalculé à la réception.
 *
 * ── IDEMPOTENCE ─────────────────────────────────────────────────────────────
 *
 * Une seconde acceptation ne réécrit RIEN : l'`update` est conditionné sur
 * `devis_accepte_le is null`. Les antivirus de messagerie préchargent les liens
 * et les gens cliquent deux fois ; la première acceptation fait foi, et son
 * instantané ne doit pas être remplacé par un dossier qui a bougé entre-temps.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import {
  ouvrirLien, contexteDossier, marquerUtilise, intituleFormation,
  financementLisible, lieuCours, periodeCours, euros, etatParticipation,
} from "@/lib/liensCandidat";
import { journaliser, prevenirSecretariat, ligneInterne } from "@/lib/liensCandidatPages";
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
  if (await limiteDepassee(`devis:accepter:ip:${ip}`, 20, 900)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL_PUBLIC}.` },
      { status: 429 },
    );
  }

  const lien = await ouvrirLien(b.j, "devis");
  if (!lien) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}, nous vous en renvoyons un.` },
      { status: 410 },
    );
  }

  /* L'intention est confirmée par une case cochée, pas déduite de l'appel. Un
     POST déclenché par un préchargement de lien ne porte pas ce champ. */
  if (String(b.accepte ?? "").trim().toLowerCase() !== "oui") {
    return NextResponse.json(
      { ok: false, erreur: "Cochez la case pour confirmer votre accord." }, { status: 400 },
    );
  }

  const c = await contexteDossier(lien.dossierId);
  if (!c) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 410 },
    );
  }

  // Déjà accepté : on répond ok sans réécrire. La page affichera l'horodatage existant.
  if (c.devisAccepteLe) {
    await marquerUtilise(lien.id);
    return NextResponse.json({ ok: true, deja: true });
  }

  const lieu = lieuCours(c);
  /* L'instantané. Relu en base à l'instant, jamais reçu du navigateur.
     Les mêmes éléments que ceux affichés par /devis — si la page en ajoute un,
     il doit entrer ici aussi, sinon la preuve devient partielle. */
  const vu = {
    accepte_le: new Date().toISOString(),
    intitule: intituleFormation(c),
    heures_prevues: c.heuresPrevues,
    niveau_vise: c.niveauVise,
    montant: c.montant,
    montant_lisible: euros(c.montant),
    financement: c.financement,
    financement_lisible: financementLisible(c.financement),
    numero_edof: c.numeroEdof,
    lieu: lieu ? `${lieu.nom} — ${lieu.adresse}` : null,
    periode: periodeCours(c),
    seances: c.seances,
    participation_forfaitaire: etatParticipation(c),
    /* L'adresse IP n'est PAS conservée : elle n'ajoute rien à la preuve (le
       jeton nominatif identifie déjà le dossier) et ce serait une donnée
       personnelle de plus à justifier. Le lien, l'horodatage et l'instantané
       suffisent. */
  };

  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .update({ devis_accepte_le: vu.accepte_le, devis_accepte_vu: vu })
    .eq("id", lien.dossierId)
    // 🔴 L'arbitre de l'idempotence est la BASE, pas l'ordre des appels : deux
    // clics simultanés, et seul le premier trouve la ligne à mettre à jour.
    .is("devis_accepte_le", null)
    .select("id")
    .maybeSingle();

  if (error) {
    await journaliser("devis_acceptation_echec", lien.dossierId, { erreur: error.message });
    return NextResponse.json(
      { ok: false, erreur: `Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 500 },
    );
  }
  // `data` vide = quelqu'un (ou un second clic) est passé avant. Succès, rien à refaire.
  if (!data) {
    await marquerUtilise(lien.id);
    return NextResponse.json({ ok: true, deja: true });
  }

  await marquerUtilise(lien.id);

  const nom = `${c.prenom} ${c.nom}`.trim();
  const envoi = await prevenirSecretariat(
    `Devis ACCEPTÉ — ${nom} · ${c.heuresPrevues} h · ${euros(c.montant)}`,
    "Devis accepté par le candidat",
    `<p>Le candidat a accepté son devis depuis le lien qui lui a été envoyé.
     L'acceptation est horodatée et une copie exacte de ce qu'il a vu est conservée au
     dossier.</p>
     ${ligneInterne("Candidat", nom)}
     ${ligneInterne("Formation", vu.intitule)}
     ${ligneInterne("Volume", `${c.heuresPrevues} h`)}
     ${ligneInterne("Montant", euros(c.montant))}
     ${ligneInterne("Financement", vu.financement_lisible)}
     ${ligneInterne("N° dossier EDOF", c.numeroEdof)}
     ${ligneInterne("Dates des cours", vu.periode ?? "pas encore arrêtées")}
     ${ligneInterne("Lieu", vu.lieu)}
     ${ligneInterne("Accepté le", new Date(vu.accepte_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))}
     <p style="margin-top:14px"><b>Prochaine étape :</b> la convention de formation.
     ${vu.participation_forfaitaire === "due"
       ? "⚠️ La participation forfaitaire CPF n'est pas encore réglée — la convention reste bloquée tant qu'elle ne l'est pas (ou que le candidat n'est pas exonéré)."
       : ""}</p>`,
    lien.dossierId,
  );

  await journaliser("devis_accepte", lien.dossierId, {
    montant: c.montant, heures: c.heuresPrevues, financement: c.financement,
    secretariat_prevenu: envoi.ok, secretariat_erreur: envoi.erreur ?? null,
  });

  return NextResponse.json({ ok: true });
}
