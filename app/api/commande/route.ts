/**
 * MYSTORY — POST /api/commande  (PUBLIC)
 *
 * Reçoit le formulaire de `/commande`, RECALCULE la commande, l'enregistre, réserve
 * les matinées, crée les pré-inscriptions, et renvoie au candidat son lien de paiement.
 *
 * Quatre règles qui tiennent tout. Les trois premières sont celles de
 * `/api/inscription-examen` — elles ne se discutent pas, elles s'appliquent :
 *
 * 1. **Le montant est recalculé ici.** Il n'est jamais lu depuis le formulaire. Aucun
 *    prix ne transite par le navigateur, pas même en champ caché : un prix modifiable
 *    avec les outils de développement, c'est 1 € encaissé pour une préparation à 660 €.
 *
 * 2. **Les sessions ET les matinées sont relues ici.** Entre l'affichage de la page et
 *    l'envoi du formulaire, la dernière place a pu partir. On refuse plutôt que de
 *    vendre deux fois le même siège — ou la même chaise de salle.
 *
 * 3. **Rien n'est compté comme vendu.** La commande et ses pré-inscriptions restent
 *    « en_attente » tant que le paiement n'est pas confirmé par la source (webhook qui
 *    relit chez Mollie, ou relecture du dossier chez Lenbox). Une inscription
 *    enregistrée avant paiement, c'est un candidat attendu qui n'a peut-être rien réglé.
 *
 * 4. **UNE PRÉ-INSCRIPTION PAR ÉLÉMENT CONVERTIBLE.** C'est le choix d'architecture de
 *    cette route, et il mérite d'être expliqué : un robot n8n convertit les
 *    pré-inscriptions payées toutes les 5 minutes, et c'est cette conversion qui produit
 *    l'attestation, la convocation et la facture. Elle sait traiter UN examen. Plutôt que
 *    de lui apprendre à lire une commande composée — donc de la modifier, donc de risquer
 *    les 2 920 conversions qui marchent — on découpe la commande en pré-inscriptions
 *    ordinaires, indiscernables de celles qu'une vendeuse saisit à la main. Le robot ne
 *    sait même pas qu'elles appartiennent à une commande.
 *
 * ⚠️ Ce que la conversion NE SAIT PAS faire : les HEURES de préparation. Il n'existe
 * aucun chemin automatique pour vendre et facturer une prestation de formation. Elles
 * restent sur la commande et le secrétariat est prévenu nommément, avec les dates. Tant
 * que la direction n'a pas tranché comment une préparation se facture, mieux vaut un
 * e-mail à traiter qu'une facture inventée.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail, adresseValide } from "@/lib/email";
import { creerPaiement, molliePret } from "@/lib/mollie";
import { creerSessionLenbox, lenboxPret, fractionnePour } from "@/lib/lenbox";
import { urlDeBase } from "@/lib/appUrl";
import { MOTIVATIONS_CCI, euros, jourLisible } from "@/lib/inscriptionEnLigne";
import {
  lireCommande, reserverMatinees, libererMatinees, resumeCommande,
  MATINEE_HORAIRE, PREPARATION_TAUX_HORAIRE, dateExamenLaPlusProche,
  libererReservationsPerimees, COMMANDES_IMPAYEES_MAX_PAR_EMAIL, RESERVATION_MINUTES,
  declarationLisible, type Commande,
} from "@/lib/commande";
import { ech, enTete } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Vente en ligne : attribuée à Aru (décision du 28/09/2026). */
const VENDEUR_EN_LIGNE = "Aru";
const AGENCE_EN_LIGNE = "Rosny";
const TEL = "06 81 43 16 54";

const OBLIGATOIRES = [
  "civilite", "genre", "nom", "prenom", "date_naissance", "lieu_naissance",
  "nationalite", "langue_maternelle", "telephone", "email", "adresse", "code_postal",
  "ville", "pays", "piece_identite",
] as const;

const s = (v: unknown) => String(v ?? "").trim();

/** Limite simple par IP : 5 commandes par quart d'heure suffisent largement. */
const recents = new Map<string, number[]>();
function tropDeTentatives(ip: string): boolean {
  const t = Date.now();
  const liste = (recents.get(ip) ?? []).filter((x) => t - x < 900_000);
  liste.push(t);
  recents.set(ip, liste);
  if (recents.size > 500) recents.clear(); // pas de fuite mémoire sur une instance chaude
  return liste.length > 5;
}

async function journal(evenement: string, entiteId: string | null, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "commandes_en_ligne", entite_id: entiteId, evenement,
      nouvelle_valeur: detail, auteur: VENDEUR_EN_LIGNE,
    });
  } catch {
    /* le journal ne doit jamais faire échouer une commande */
  }
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  // Piège à robots : un humain ne remplit jamais ce champ, il est hors écran.
  if (s(b.website)) return NextResponse.json({ ok: true, paiement: null });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (tropDeTentatives(ip)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL}.` },
      { status: 429 },
    );
  }

  const manquants = OBLIGATOIRES.filter((c) => !s(b[c]));
  if (manquants.length) {
    return NextResponse.json(
      { ok: false, erreur: "Merci de remplir tous les champs obligatoires." },
      { status: 400 },
    );
  }

  const email = s(b.email).toLowerCase();
  if (!adresseValide(email)) {
    return NextResponse.json(
      { ok: false, erreur: "Cette adresse e-mail ne semble pas valide — c'est par là que partira votre convocation." },
      { status: 400 },
    );
  }

  /* ── 0. Plafond de commandes impayées par adresse ──────────────────────────
   *
   * La limite par IP ci-dessus ne protège pas la SALLE : cinq commandes abandonnées
   * suffisent à retenir cinq chaises, et une adresse jetable change d'IP. Les
   * réservations se périment en 30 minutes, ce qui borne la DURÉE de l'abus ; ce
   * plafond en borne l'AMPLEUR.
   *
   * On nettoie d'abord : sans ça, le candidat qui revient une heure après un abandon
   * serait refusé au nom de commandes déjà mortes. */
  await libererReservationsPerimees();
  const { count: enCours } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("id", { count: "exact", head: true })
    .eq("candidat_email", email)
    .eq("statut", "en_attente")
    .is("paye_le", null);

  if ((enCours ?? 0) >= COMMANDES_IMPAYEES_MAX_PAR_EMAIL) {
    return NextResponse.json({
      ok: false,
      erreur:
        `Vous avez déjà ${enCours} commande${(enCours ?? 0) > 1 ? "s" : ""} en attente de paiement. ` +
        `Terminez-en une, patientez ${RESERVATION_MINUTES} minutes, ou appelez-nous au ${TEL}.`,
    }, { status: 429 });
  }

  // ── 1. La commande, recalculée. C'est le seul prix qui existe. ─────────────
  const lu = await lireCommande({
    session: s(b.session) || null,
    session_civique: s(b.session_civique) || null,
    mention: s(b.mention) || null,
    preparation: s(b.preparation) || null,
    matinees: s(b.matinees) || null,
    options: s(b.options) || null,
    /* La déclaration de carence, relue ICI aussi — comme le montant et comme les
       places. Le formulaire la renvoie, mais c'est `lireDeclaration()` qui décide
       de ce qui est exploitable : une date fabriquée à la main dans la requête ne
       doit pas plus être crue qu'un prix. */
    carence_tef: s(b.carence_tef) || null,
    carence_tef_dernier: s(b.carence_tef_dernier) || null,
    carence_civique: s(b.carence_civique) || null,
    carence_civique_dernier: s(b.carence_civique_dernier) || null,
  });
  if (!lu.ok) {
    return NextResponse.json({ ok: false, erreur: lu.erreurs.join(" ") }, { status: lu.statut });
  }
  const c = lu.commande as Commande;

  // La motivation TEF part telle quelle à la CCI : elle doit appartenir à leur liste.
  const sousTypeTef = s(b.sous_type);
  if (c.tef) {
    if (!(MOTIVATIONS_CCI as readonly string[]).includes(sousTypeTef)) {
      return NextResponse.json({ ok: false, erreur: "Motif d'examen invalide." }, { status: 400 });
    }
  }

  /* ── 2. Le moyen de paiement demandé, REVALIDÉ côté serveur ────────────────
   *
   * Le navigateur peut envoyer « lenbox:FLOA_10XP » sur une commande de 90 €, ou sur un
   * examen qui a lieu après-demain : c'est `fractionnePour()` qui décide, jamais le
   * formulaire. Le contrôle le plus important est celui de la DATE — un financement ouvre
   * un délai légal de rétractation de 14 jours, et un candidat qui passe son épreuve
   * avant la fin de ce délai peut se rétracter : service rendu, financement annulé.
   * Masquer l'option à l'affichage ne suffit donc pas, il faut REFUSER à la réception. */
  const moyenDemande = s(b.moyen) || "mollie";
  let echeancier: string | null = null;
  if (moyenDemande.startsWith("lenbox:")) {
    const code = moyenDemande.slice("lenbox:".length);
    const { echeanciers, motif } = fractionnePour(c.montant, dateExamenLaPlusProche(c));
    const propose = echeanciers.find((e) => e.code === code);
    if (!propose) {
      return NextResponse.json(
        {
          ok: false,
          erreur: motif ?? "Le paiement en plusieurs fois n'est pas disponible pour cette commande.",
        },
        { status: 400 },
      );
    }
    echeancier = code;
  }

  const identite = {
    civilite: s(b.civilite),
    genre: s(b.genre),
    candidat_nom: s(b.nom).toUpperCase(),
    candidat_prenom: s(b.prenom),
    candidat_email: email,
    candidat_telephone: s(b.telephone),
    date_naissance: s(b.date_naissance),
    lieu_naissance: s(b.lieu_naissance),
    nationalite: s(b.nationalite),
    langue_maternelle: s(b.langue_maternelle),
    adresse: s(b.adresse),
    code_postal: s(b.code_postal),
    ville: s(b.ville),
    pays: s(b.pays) || "France",
    piece_identite: s(b.piece_identite),
  };

  // ── 3. La commande en base ────────────────────────────────────────────────
  const { data: cmd, error: errCmd } = await supabaseAdmin
    .from("commandes_en_ligne")
    .insert({
      ...identite,
      session_tef_id: c.tef?.id ?? null,
      session_civique_id: c.civique?.id ?? null,
      mention: c.mention,
      preparation_heures: c.heures,
      matinees: c.matinees,
      options: c.options,
      centre_matinees: c.centreMatinees,
      /* La déclaration de carence, CONSERVÉE. C'est tout l'objet du correctif du
         09/10 : le site promettait au candidat que ses réponses partaient avec sa
         réservation, et elles n'arrivaient nulle part. `null` reste `null` — une
         absence de réponse n'est pas un « non ». */
      carence_tef_declaree: c.declaration.tef,
      carence_tef_dernier_passage: c.declaration.tefDernier,
      carence_civique_declaree: c.declaration.civique,
      carence_civique_dernier_passage: c.declaration.civiqueDernier,
      montant: c.montant,
      detail: c.lignes,
      urgence: c.urgence,
      statut: "en_attente",
      agence: AGENCE_EN_LIGNE,
      cree_par: VENDEUR_EN_LIGNE,
      moyen_paiement: echeancier ? "lenbox" : "mollie",
    })
    .select("id")
    .single();

  if (errCmd || !cmd) {
    return NextResponse.json(
      { ok: false, erreur: `Nous n'avons pas pu enregistrer votre commande. Appelez-nous au ${TEL}, nous la finalisons avec vous.` },
      { status: 500 },
    );
  }
  const ref = String((cmd as any).id);

  // ── 4. Les matinées : la ressource rare, réservée en premier ───────────────
  if (c.matinees.length) {
    const r = await reserverMatinees(ref, c.matinees, c.centreMatinees);
    if (!r.ok) {
      await supabaseAdmin.from("commandes_en_ligne")
        .update({ statut: "annulee" }).eq("id", ref);
      await journal("commande_matinee_complete", ref, { pleines: r.pleines, centre: c.centreMatinees });
      return NextResponse.json({
        ok: false,
        erreur:
          `Une de vos matinées vient d'être complétée : ${r.pleines.map(jourLisible).join(" · ")}. ` +
          `Choisissez une autre matinée sur le site, ou appelez-nous au ${TEL} — nous vous replaçons.`,
      }, { status: 409 });
    }
  }

  // ── 5. Une pré-inscription par élément convertible ─────────────────────────
  // Volontairement SANS `lien_paiement` : la relance automatique J+1
  // (`/api/examens/preinscriptions/relances`) ne relance que les lignes qui en portent
  // un. Sans ça, une commande de trois lignes enverrait trois rappels au même candidat,
  // chacun annonçant un montant partiel. La relance d'une commande impayée reste donc à
  // construire — c'est écrit dans le compte rendu, ce n'est pas un oubli.
  const aConvertir = c.lignes.filter((l) => l.ligne !== "preparation");
  const idsPre: string[] = [];
  for (const l of aConvertir) {
    const { data: pre, error } = await supabaseAdmin
      .from("preinscriptions_examen")
      .insert({
        ...identite,
        commande_id: ref,
        session_id: l.sessionId ?? null,
        type_examen: l.typeExamen,
        sous_type: l.typeExamen === "TEF_IRN" ? sousTypeTef : (l.sousType ?? null),
        montant: l.prix,
        statut: "en_attente",
        origine: "en_ligne",
        agence: AGENCE_EN_LIGNE,
        cree_par: VENDEUR_EN_LIGNE,
        plateforme: l.ligne === "plateforme" ? l.sousType : null,
      })
      .select("id")
      .single();
    if (error || !pre) {
      // Une ligne manquante, c'est une convocation qui ne partira pas. On ne laisse
      // surtout pas le candidat payer un ensemble incomplet : on relâche et on arrête.
      await libererMatinees(ref);
      await supabaseAdmin.from("commandes_en_ligne")
        .update({ statut: "annulee" }).eq("id", ref);
      await journal("commande_ligne_echec", ref, {
        ligne: l.libelle, erreur: error?.message ?? "inconnue",
      });
      return NextResponse.json(
        { ok: false, erreur: `Nous n'avons pas pu enregistrer votre commande en entier. Appelez-nous au ${TEL}, nous la reprenons avec vous.` },
        { status: 500 },
      );
    }
    idsPre.push(String((pre as any).id));
  }

  await journal("commande_creee", ref, {
    montant: c.montant, lignes: aConvertir.length, heures: c.heures,
    matinees: c.matinees, email, moyen: echeancier ?? "mollie",
    /* La déclaration ET le verdict dans le journal : c'est la trace de ce qu'on
       a su, et de ce qu'on en a dit, au moment où on a encaissé. Dans six mois,
       si un résultat est refusé pour carence, c'est la seule pièce qui dira si
       le candidat l'avait déclaré ou non. */
    declaration: c.declaration,
    carence_non_tenue: c.carenceNonTenue,
    carence_a_verifier: c.carenceAVerifier,
  });

  /* ── La déclaration de carence qui pose problème : on prévient TOUT DE SUITE ──
   *
   * Pas à la validation du paiement, et c'est délibéré : le candidat vient de lire
   * « appelez-nous avant de payer », et quelqu'un doit pouvoir décrocher. Attendre
   * l'encaissement, c'est attendre le moment où l'erreur n'est plus réparable
   * gratuitement.
   *
   * Le volume ne pose pas de problème : le site REFUSE d'avancer sur une carence
   * non tenue, donc une commande qui arrive ici dans cet état vient d'une URL
   * recopiée à la main. C'est rare par construction — et le jour où ça ne l'est
   * plus, c'est que le parcours a un défaut, et cet e-mail est précisément ce qui
   * nous l'apprendra.
   *
   * On NE REFUSE PAS la commande pour autant : une déclaration est un signal, pas
   * une preuve, et la garde dure reste à la conversion (voir lib/commande.ts). */
  if (c.carenceNonTenue.length || c.carenceAVerifier.length) {
    await alerterSecretariat(
      ref, c, identite,
      c.carenceNonTenue.length
        ? "⚠️ Carence déclarée NON TENUE — à rappeler avant l'examen"
        : "Déclaration de carence incomplète — à vérifier",
      false,
    );
  }

  // ── 6. Le paiement ────────────────────────────────────────────────────────
  const lien = await lienDePaiement(req, ref, c, echeancier, identite);

  if (lien) {
    /* `lenbox_session_id` est posé À PART : c'est lui qui permettra au récepteur de
       vérifier qu'un dossier financé correspond bien à CETTE commande. Lenbox distingue
       l'identifiant de session (rendu ici) de celui de la demande (porté par la
       notification), et la liaison doit tenir dans les deux sens. */
    await supabaseAdmin.from("commandes_en_ligne")
      .update({
        lien_paiement: lien.url,
        reference_paiement: lien.reference,
        lenbox_session_id: echeancier ? lien.reference : null,
      })
      .eq("id", ref);
    return NextResponse.json({ ok: true, paiement: lien.url });
  }

  /* Pas de lien : on NE PERD PAS le candidat. La commande est conservée avec ses
     matinées et ses pré-inscriptions, le secrétariat est prévenu, et le message invite
     à attendre le lien par e-mail. Un formulaire rempli est un client ; on ne le jette
     pas parce qu'un appel réseau a échoué. */
  await journal("commande_sans_lien", ref, { montant: c.montant, email });
  await alerterSecretariat(ref, c, identite, "Lien de paiement à envoyer à la main", true);

  return NextResponse.json({
    ok: false,
    erreur: "Votre commande est bien enregistrée. Nous vous envoyons votre lien de paiement par e-mail dans quelques minutes — vous n'avez rien à refaire.",
  }, { status: 202 });
}

/**
 * Crée le paiement et renvoie la page de règlement.
 *
 * Mollie pour la carte, Lenbox pour le fractionné. Dans les deux cas la référence est
 * l'identifiant de NOTRE commande : c'est elle qui revient dans la notification et qui
 * fait le lien entre l'argent reçu et le candidat. Ne jamais la retirer.
 *
 * ⚠️ Le webhook est `/api/commande/paiement`, PAS `/api/paiements/mollie` : ce dernier
 * cherche la référence dans `preinscriptions_examen`, où l'identifiant d'une commande
 * n'existe pas. Deux récepteurs distincts pour deux objets distincts — et le chemin qui
 * encaisse déjà les inscriptions simples n'est pas touché.
 *
 * Renvoie null si rien n'est configuré ou si le prestataire refuse : l'appelant bascule
 * alors sur l'envoi manuel, et aucune commande n'est perdue.
 */
async function lienDePaiement(
  req: NextRequest, reference: string, c: Commande, echeancier: string | null,
  identite: Record<string, string>,
): Promise<{ url: string; reference: string } | null> {
  const base = urlDeBase(req);
  const intitule = `MYSTORY — ${c.lignes.map((l) => l.libelle.split(" — ")[0]).join(" + ")}`;

  if (echeancier) {
    if (!lenboxPret()) return null;
    try {
      const sess = await creerSessionLenbox({
        montant: c.montant,
        titre: intitule,
        reference,
        echeanciers: [echeancier],
        client: {
          civilite: identite.civilite,
          prenom: identite.candidat_prenom,
          nom: identite.candidat_nom,
          email: identite.candidat_email,
          telephone: identite.candidat_telephone,
          // L'adresse est déjà saisie : la transmettre évite de la redemander au
          // candidat dans le parcours Lenbox, où chaque champ de plus coûte un abandon.
          adresse: identite.adresse,
          codePostal: identite.code_postal,
          ville: identite.ville,
        },
        urlNotification: `${base}/api/paiements/lenbox`,
        urlSucces: `${base}/commande/merci?r=${encodeURIComponent(reference)}`,
        urlEchec: `${base}/commande/merci?r=${encodeURIComponent(reference)}`,
      });
      return { url: sess.url, reference: sess.sessionId };
    } catch (e) {
      await journal("paiement_lenbox_echec", reference, {
        erreur: e instanceof Error ? e.message : "inconnue", montant: c.montant,
      });
      return null;
    }
  }

  if (!molliePret()) return null;
  try {
    const p = await creerPaiement({
      montant: c.montant,
      description: intitule,
      reference,
      email: identite.candidat_email,
      urlRetour: `${base}/commande/merci?r=${encodeURIComponent(reference)}`,
      urlWebhook: `${base}/api/commande/paiement`,
      /* `lignes` et `adresse` ne nous servent à rien : elles servent à faire apparaître
         KLARNA sur la page Mollie. Sans elles, Mollie masque Klarna sans aucun message
         d'erreur — on croit alors que le moyen est désactivé alors qu'il est bien actif
         sur le compte. Ne pas les retirer comme « inutiles » (voir lib/mollie.ts).
         La décomposition est EXACTEMENT celle du récapitulatif affiché, donc la somme
         tombe au centime sur le total : Mollie rejette tout écart. */
      lignes: c.lignes.map((l) => ({ libelle: l.libelle, prix: l.prix })),
      adresse: {
        prenom: identite.candidat_prenom,
        nom: identite.candidat_nom,
        email: identite.candidat_email,
        adresse: identite.adresse,
        codePostal: identite.code_postal,
        ville: identite.ville,
        pays: identite.pays,
      },
    });
    return { url: p.url, reference: p.id };
  } catch (e) {
    await journal("paiement_mollie_echec", reference, {
      erreur: e instanceof Error ? e.message : "inconnue", montant: c.montant,
    });
    return null;
  }
}

/**
 * Prévient le secrétariat de ce qu'aucune automatisation ne sait faire.
 *
 * 🔴 Tout ce qui vient du formulaire est ÉCHAPPÉ (`ech`) avant d'entrer dans ce HTML, et
 * l'objet est débarrassé de ses retours chariot (`enTete`). Ces valeurs sont saisies par
 * des inconnus : un nom contenant `<b>` casserait la mise en forme d'une boîte que le
 * secrétariat ouvre tous les jours, un saut de ligne dans l'objet permettrait d'injecter
 * un en-tête de message. Voir lib/html.ts — ne pas retirer « pour la lisibilité ».
 */
async function alerterSecretariat(
  ref: string, c: Commande, identite: Record<string, string>,
  objet: string, lienManquant: boolean,
): Promise<void> {
  const heures = c.heures > 0
    ? `<p><b>⚠️ Préparation de ${c.heures} h à planifier</b> — aucune conversion automatique ne
       traite les heures de cours.<br>Matinées retenues (${MATINEE_HORAIRE}, ${ech(c.centreMatinees)}) :
       <b>${c.matinees.map((m) => ech(jourLisible(m))).join(" · ")}</b><br>
       Part « heures de cours » : <b>${euros(c.heures * PREPARATION_TAUX_HORAIRE)}</b> (la part
       examen, elle, est facturée par la conversion de la pré-inscription).</p>`
    : "";

  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: enTete(`${objet} — ${identite.candidat_nom} ${identite.candidat_prenom} · ${euros(c.montant)}`),
    html: gabaritEmail(objet, `
      ${lienManquant ? `<p>Une commande en ligne vient d'être enregistrée, mais le lien de paiement
       n'a pas pu être créé automatiquement. <b>Merci d'envoyer un lien de paiement de
       ${euros(c.montant)}</b>.</p>` : ""}
      <p><b>${ech(identite.candidat_nom)} ${ech(identite.candidat_prenom)}</b><br>
      ${ech(identite.candidat_email)} · ${ech(identite.candidat_telephone)}</p>
      ${blocCarence(c)}
      <pre style="font-family:inherit;white-space:pre-wrap;background:#f4f6fb;padding:12px;border-radius:8px">${ech(resumeCommande(c))}</pre>
      ${heures}
      <p style="color:#888;font-size:12px">Commande ${ech(ref)}</p>`),
    entite: "commandes_en_ligne",
    entiteId: ref,
  });
}

/**
 * La déclaration de carence, en haut de l'e-mail et pas en annexe.
 *
 * C'est tout l'objet du correctif : le site PROMET au candidat que ses réponses
 * « sont vérifiées par notre secrétariat ». Une déclaration rangée dans le pavé
 * de récapitulatif, sous le total, n'est pas vérifiée — elle est lue en diagonale
 * une fois sur dix. Un bloc coloré au-dessus du devis l'est.
 *
 * Rouge quand le délai n'est pas tenu (le certificateur refuserait le résultat),
 * ambre quand on ne peut rien conclure, ambre léger quand la réponse est « oui »
 * mais que le délai tient — ce dernier cas ne demande aucune action, il est là
 * pour que personne ne découvre la chose après coup.
 */
function blocCarence(c: Commande): string {
  const lignes = declarationLisible(c.declaration, !!c.tef, !!c.civique);
  const positive = c.declaration.tef === true || c.declaration.civique === true;
  if (!lignes.length && !c.carenceNonTenue.length && !c.carenceAVerifier.length) return "";
  if (!positive && !c.carenceNonTenue.length && !c.carenceAVerifier.length) return "";

  const grave = c.carenceNonTenue.length > 0;
  const cadre = grave
    ? "background:#fdecec;border:1px solid #f3b7b7"
    : "background:#fff4e5;border:1px solid #ffd9a8";
  const titre = grave
    ? "🔴 Carence déclarée NON TENUE — le résultat serait refusé"
    : c.carenceAVerifier.length
      ? "⚠️ Déclaration de carence incomplète"
      : "Déclaration de carence — passage récent annoncé";

  return `<p style="${cadre};padding:12px;border-radius:8px">
    <b>${titre}</b><br>
    ${lignes.map((l) => ech(l)).join("<br>")}
    ${[...c.carenceNonTenue, ...c.carenceAVerifier].map((a) => `<br><br>${ech(a)}`).join("")}
    ${grave || c.carenceAVerifier.length
      ? `<br><br>👉 <b>Appelez le candidat avant de le convoquer.</b> C'est une déclaration,
         pas une preuve : la date est peut-être mal saisie. Si elle est juste, replacez-le sur
         une session qui respecte le délai — il a payé, et un résultat refusé ne se rattrape pas.`
      : `<br><br>Rien à faire si la date est exacte : le délai est tenu. Noté ici pour que
         personne ne le découvre après l'épreuve.`}
  </p>`;
}
