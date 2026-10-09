/**
 * MYSTORY — GET /api/examens/ventes-en-ligne  (lecture seule, pour le robot n8n)
 *
 * 09/10/2026. Les primes se calculent sur l'onglet « Examens » du classeur de suivi,
 * jamais sur Supabase : le robot « Classement vendeurs AUTO (quotidien 19h) » lit ce
 * classeur et agrège la colonne « Vendu par ». Or le CRM n'écrit JAMAIS dans ce
 * classeur. Conséquence constatée le 09/10 : les ventes encaissées seules par le site
 * — rattachées à « Aru » exprès, pour ne pas gonfler les primes des conseillères —
 * existaient dans Supabase, étaient facturées, mais n'apparaissaient NULLE PART dans
 * le classement. Arudhan ne les voyait pas.
 *
 * Cette route est la source de vérité que le robot « Ventes du site → onglet Examens »
 * recopie dans le classeur. Elle ne décide rien, elle ne modifie rien : elle REND les
 * ventes du site, déjà mises au format de l'onglet, et c'est tout.
 *
 * ── POURQUOI LE FORMATAGE EST ICI, ET PAS DANS LE ROBOT ─────────────────────────
 * Parce qu'ici il est relu et compilé. Le gabarit de l'onglet est positionnel (32
 * cellules A→AF) et le moindre décalage efface une donnée voisine — c'est exactement
 * ce qui est arrivé le 18/09/2026 en ajoutant la colonne « Centre ». Les noms de
 * champs rendus ici sont ceux que le sous-robot `UTIL — MAJ ligne Examens v2` attend
 * déjà pour les ventes des conseillères : on ne réinvente pas un second écrivain,
 * on alimente celui qui existe.
 *
 * ── DEUX LECTEURS, UN SEUL FORMAT (09/10/2026, après-midi) ──────────────────────
 * Un second robot lit maintenant cette route : « Paiements du site → onglet Paiements
 * site », qui alimente un onglet NEUF de suivi des encaissements. Il a besoin de ce que
 * le gabarit A→AF ne porte pas : la date d'encaissement, la référence du paiement, le
 * moyen réel, la série de facturation.
 *
 * Tout cela est rendu dans des champs préfixés `_`. Ce n'est pas une coquetterie : le
 * robot des primes SAUTE toute clé commençant par `_` avant de passer la ligne au
 * sous-robot d'écriture, qui refuse une ligne qui ne fait pas exactement 32 colonnes.
 * Un champ nouveau non préfixé casserait donc l'écriture des primes. 🔴 Tout ajout
 * futur se nomme `_…`.
 *
 * Le paramètre `?moyen=detail` (optionnel) fait relire les paiements chez Mollie pour
 * connaître le moyen employé — carte, Klarna, iDEAL. Le robot des primes ne le passe
 * PAS, et ne doit jamais le passer : voir le commentaire au point d'appel.
 *
 * ── CE QU'ELLE NE REND PAS ──────────────────────────────────────────────────────
 * Les ventes remboursées ou annulées. Le classeur se corrige alors ligne par ligne
 * (opérations `remboursement` / `annulation` du sous-robot), pas en ajoutant une
 * ligne de plus. Une vente du site remboursée reste donc à traiter à la main — c'est
 * assumé : fabriquer un correctif automatique sur une ligne qu'on n'a pas encore
 * écrite serait inventer un problème avant de l'avoir.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lireMoyen } from "@/lib/mollie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NEUTRALISER CE QUI PART DANS UN CLASSEUR. Une seule fonction, appliquée à TOUTES
 * les valeurs texte en sortie — jamais champ par champ : champ par champ, on en
 * oublie un, et c'est toujours celui-là qui sert.
 *
 * Presque tout ce que rend cette route vient d'un formulaire PUBLIC : nom, prénom,
 * lieu de naissance, adresse, n° de pièce. Une cellule de tableur qui commence par
 * `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est une FORMULE — de quoi
 * poser un `IMPORTDATA` dans l'onglet Examens, ou simplement un `#REF!`. Et l'onglet
 * Examens est le pire endroit pour ça : le robot des primes refuse de calculer quoi
 * que ce soit s'il y lit moins de 50 numéros d'attestation. Une cellule cassée
 * arrêterait les primes de TOUT LE MONDE.
 *
 * ⚠️ On RETIRE le caractère d'amorce, on ne préfixe PAS d'apostrophe. L'écriture se
 * fait en `valueInputOption=RAW` (vérifié dans le sous-robot « UTIL — MAJ ligne
 * Examens v2 ») : l'apostrophe y serait stockée telle quelle et s'afficherait dans
 * chaque cellule — un nom sur deux deviendrait `'DUPONT`, et un numéro d'attestation
 * `'MYS-2026-…` ne serait plus reconnu par la numérotation du robot d'intake, qui
 * basculerait en numéros « URG ». Le remède serait pire que le mal.
 *
 * RAW protège déjà des formules aujourd'hui. Cette fonction est la ceinture qui tient
 * encore si quelqu'un passe un jour l'écriture en `USER_ENTERED` sans y penser.
 */
function texteSheet(valeur: string): string {
  const sansControle = valeur
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .trim();

  /* On ne retire l'amorce que si ce qui suit peut VRAIMENT être une formule, c'est-à-dire
     s'il reste une lettre ou une parenthèse : `=HYPERLINK(…)`, `@IMPORTDATA`, `-A1`.
     Sans ce garde-fou, `+33601079540` — un vrai numéro de téléphone, présent dans les
     données du 02/10 — perdrait son indicatif international. `=1+1` resterait, et c'est
     très bien : du texte en RAW, un 2 en USER_ENTERED, rien d'exfiltrable ni de cassé. */
  if (/^[=+\-@]/.test(sansControle) && /[A-Za-z(]/.test(sansControle.slice(1))) {
    return texteSheet(sansControle.slice(1));
  }
  return sansControle;
}

/** Les champs numériques du gabarit : ils doivent rester des nombres, pas du texte. */
const CHAMPS_NUMERIQUES = ["montant", "montant_cb", "prime", "row_number"];

/** Le libellé de type attendu par l'onglet (colonne C), qui n'est pas celui de Supabase. */
const TYPE_ONGLET: Record<string, string> = {
  TEF_IRN: "TEF IRN",
  Examen_civique: "Examen civique",
  Vente_plateforme: "Vente plateforme",
};

/** `2026-10-08` → `08/10/2026`. Tout le classeur est en jj/mm/aaaa, sans exception. */
function jjmmaaaa(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/**
 * Le moyen de paiement réel, tel qu'il doit apparaître en colonne Z « Mode paiement ».
 *
 * Ne JAMAIS écrire « Qonto » ici : le lien Qonto a été abandonné le 29/09/2026 au
 * profit de Mollie, et depuis le 09/10 Lenbox encaisse aussi en 3× ou 4×. Un
 * contrôleur qui lit « Qonto » sur une vente carte Mollie lit une origine fausse.
 *
 * ⚠️ ON N'INVENTE PAS DE LIBELLÉ. La colonne Z emploie déjà un vocabulaire fermé,
 * relevé le 09/10/2026 sur les 571 lignes de l'onglet : `CB` (230), `En ligne` (159),
 * `Espèces` (80), `Élève CPF` (75), `Mixte` (11), `Lenbox` (2), `CB (Lenbox 4x)` (2),
 * `Virement` (1). « En ligne » est exactement ce qu'on veut dire, et c'est déjà ce que
 * les conseillères écrivent quand un candidat règle par lien. Ajouter une dixième
 * valeur (« CB en ligne (Mollie) ») fragmenterait une colonne sur laquelle on filtre
 * et on compte. Le prestataire, lui, est dit dans le commentaire.
 *
 * La marque qui distingue les deux : `reference_paiement`. Mollie préfixe tous ses
 * paiements par `tr_`, Lenbox rend l'identifiant de son dossier. Quand la vente vient
 * d'une commande composée, `commandes_en_ligne.moyen_paiement` le dit en clair et fait
 * foi — on le préfère.
 */
function modePaiement(moyenCommande: string | null, reference: string | null): string {
  if (moyenCommande === "lenbox") return "Lenbox";
  if (moyenCommande === "mollie") return "En ligne";
  if (reference && !reference.startsWith("tr_")) return "Lenbox";
  return "En ligne";
}

/**
 * `2026-10-08T20:24:47Z` → `08/10/2026 22:24` (heure de Paris).
 *
 * L'heure compte ici : un suivi de PAIEMENTS se rapproche d'un relevé bancaire, et deux
 * encaissements du même jour doivent pouvoir se distinguer. Le fuseau est forcé à
 * Europe/Paris — un horodatage UTC afficherait 22 h 24 comme 20 h 24, et Arudhan
 * chercherait longtemps un paiement « de 20 h » dans son relevé.
 */
function jjmmaaaaHeure(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return String(iso);
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  /* `Intl` rend « 08/10/2026 22:24 » en fr-FR, mais insère parfois une virgule selon la
     version d'ICU embarquée dans le runtime. On la retire plutôt que d'en dépendre. */
  return p.replace(",", "").replace(/\s+/g, " ").trim();
}

/**
 * Les codes de moyen de paiement rendus par Mollie, en clair.
 *
 * 🔴 Pourquoi ces libellés sont LONGS et pas ceux de la colonne Z de l'onglet Examens :
 * ils ne vont pas dans l'onglet Examens. Ils vont dans l'onglet « Paiements site », qui
 * est NEUF et n'a aucun vocabulaire hérité à respecter. Là-bas, le but est inverse : ne
 * plus se demander ce que « En ligne » recouvre.
 *
 * Un code inconnu n'est pas masqué : il est rendu tel quel, préfixé. Mollie ajoute des
 * moyens (et nous en activons) sans nous prévenir ; un `switch` muet ferait croire à un
 * paiement par carte.
 */
const MOYEN_MOLLIE: Record<string, string> = {
  creditcard: "Carte bancaire (Mollie)",
  klarna: "Klarna (différé/fractionné)",
  ideal: "iDEAL (Mollie)",
  bancontact: "Bancontact (Mollie)",
  paypal: "PayPal (Mollie)",
  applepay: "Apple Pay (Mollie)",
  banktransfer: "Virement (Mollie)",
  directdebit: "Prélèvement (Mollie)",
  giftcard: "Carte cadeau (Mollie)",
  voucher: "Titre/voucher (Mollie)",
};

/**
 * Le moyen de paiement en clair pour l'onglet de suivi.
 *
 * `moyenMollie` n'est renseigné que si l'appelant a demandé `?moyen=detail` ET que Mollie
 * a répondu. Sans lui, on ne SAIT PAS si la carte ou Klarna a servi — et on le dit, au
 * lieu d'écrire « Carte bancaire » au hasard. Un suivi de paiements qui affirme un moyen
 * qu'il ignore est pire qu'un suivi qui l'avoue.
 */
function moyenLisible(
  moyenCommande: string | null,
  reference: string | null,
  moyenMollie: string | null,
): string {
  if (moyenCommande === "lenbox") return "Lenbox — paiement fractionné";
  /* Repli quand la commande ne dit rien : Mollie préfixe ses paiements par `tr_`, Lenbox non. */
  if (moyenCommande !== "mollie" && reference && !reference.startsWith("tr_")) {
    return "Lenbox — paiement fractionné";
  }
  if (moyenMollie) return MOYEN_MOLLIE[moyenMollie] ?? `Mollie — ${moyenMollie}`;
  return "Mollie (carte ou Klarna — non distingué)";
}

/**
 * Ce qui a été acheté, en une ligne lisible.
 *
 * Pour une vente isolée, le type et le sous-type suffisent. Pour une vente issue d'une
 * COMMANDE COMPOSÉE, le `detail` de la commande est la seule trace de ce que le candidat
 * a réellement payé en un seul versement (deux examens + préparation + plateformes) :
 * sans lui, Arudhan verrait trois lignes de 185 €, 100 € et 60 € sans comprendre qu'un
 * unique paiement de 345 € les couvre. On rend donc le détail de la commande en plus.
 */
function detailCommande(detail: unknown): string {
  if (!Array.isArray(detail)) return "";
  const bouts = detail
    .map((l: any) => {
      const lib = String(l?.libelle ?? l?.label ?? "").trim();
      if (!lib) return "";
      const prix = Number(l?.prix ?? l?.montant);
      return isFinite(prix) ? `${lib} ${prix} €` : lib;
    })
    .filter((s) => s !== "");
  return bouts.join(" + ");
}

export async function GET(req: NextRequest) {
  /* Garde alignée sur `/api/incidents` : la Direction et les automates de confiance,
     personne d'autre. Cette route rend l'identité complète des candidats — date et
     lieu de naissance, adresse, numéro de pièce d'identité. `requireUser` seul
     l'aurait ouverte à n'importe quelle session d'équipe, y compris des rôles qui
     n'ont aucune raison de lire ça. `requireRole` laisse passer le jeton de service
     n8n (exemption `estAutomate` du 25/09/2026), donc le robot fonctionne. */
  try {
    await requireRole(req, ["direction"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Réservé à la Direction" }, { status: 403 });
    }
    throw e;
  }

  /* Les pré-inscriptions du site sont le SEUL marqueur d'origine fiable. Filtrer sur
     `vendu_par = 'Aru'` serait plus simple et faux : « Arudhan » saisit aussi des ventes
     à la main, et une vendeuse pourrait un jour être renommée. */
  const { data: pres, error: ePre } = await supabaseAdmin
    .from("preinscriptions_examen")
    .select(
      "id, vente_id, commande_id, civilite, genre, date_naissance, lieu_naissance, " +
        "langue_maternelle, nationalite, adresse, code_postal, ville, pays, " +
        "piece_identite, plateforme, reference_paiement, candidat_telephone, paye_le",
    )
    .eq("origine", "en_ligne")
    .eq("statut", "convertie")
    .not("vente_id", "is", null)
    .order("converti_le", { ascending: false })
    .limit(300);
  if (ePre) return NextResponse.json({ ok: false, erreur: ePre.message }, { status: 500 });

  const parVente = new Map<string, any>();
  for (const p of pres ?? []) parVente.set(String((p as any).vente_id), p);
  const idsVente = [...parVente.keys()];
  if (idsVente.length === 0) return NextResponse.json({ ok: true, ventes: [] });

  const { data: ventes, error: eVente } = await supabaseAdmin
    .from("ventes_examen")
    .select(
      "id, type_examen, sous_type, montant, statut_paiement, date_inscription, " +
        "vendu_par, agence, numero_attestation, candidat_id, " +
        "sessions_examen:session_id (date_examen, horaire)",
    )
    .in("id", idsVente)
    .eq("statut_paiement", "Payé");
  if (eVente) return NextResponse.json({ ok: false, erreur: eVente.message }, { status: 500 });

  const idsCandidat = [...new Set((ventes ?? []).map((v: any) => v.candidat_id).filter(Boolean))];
  const { data: candidats } = await supabaseAdmin
    .from("stagiaires")
    .select("id, nom, prenom, email, telephone")
    .in("id", idsCandidat.length ? idsCandidat : ["00000000-0000-0000-0000-000000000000"]);
  const parCandidat = new Map<string, any>();
  for (const c of candidats ?? []) parCandidat.set(String((c as any).id), c);

  /* Le numéro de facture est repris du journal des factures, pas de `ventes_examen` :
     les colonnes `facture_id` / `numero_facture` de la vente ne sont jamais renseignées
     (vérifié le 09/10/2026 sur les 5 ventes existantes). */
  const { data: factures } = await supabaseAdmin
    .from("factures")
    /* `serie` et `statut` sont lus pour l'onglet de suivi : c'est là qu'on voit si une
       facture d'examen porte encore un numéro pris dans la série des ATTESTATIONS
       (`MYS-2026-…`) au lieu de la série qui lui revient (`MYS-EX-2026-…`). */
    .select("vente_id, numero, serie, statut, email_envoye_le")
    .in("vente_id", idsVente);
  const parFacture = new Map<string, any>();
  for (const f of factures ?? []) parFacture.set(String((f as any).vente_id), f);

  const idsCommande = [...new Set((pres ?? []).map((p: any) => p.commande_id).filter(Boolean))];
  const { data: commandes } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("id, moyen_paiement, lenbox_session_id, montant, detail, paye_le")
    .in("id", idsCommande.length ? idsCommande : ["00000000-0000-0000-0000-000000000000"]);
  const parCommande = new Map<string, any>();
  for (const c of commandes ?? []) parCommande.set(String((c as any).id), c);

  /* ── LE MOYEN RÉEL, SUR DEMANDE SEULEMENT ────────────────────────────────────────
     `?moyen=detail` fait relire chaque paiement chez Mollie pour connaître le moyen
     employé (carte, Klarna, iDEAL…). Cette information n'est stockée nulle part chez
     nous : le webhook n'enregistre que la référence et la date.

     🔴 POURQUOI C'EST OPTIONNEL, ET PAS LE COMPORTEMENT PAR DÉFAUT. Le robot des primes
     (`Ventes du site → onglet Examens`, CDc38BWgTOtwZdmA) appelle cette route toutes les
     20 minutes et n'a aucun besoin du moyen : sa colonne Z emploie un vocabulaire fermé
     (« En ligne », « Lenbox »). Rendre l'appel à Mollie systématique ajouterait N requêtes
     réseau sur SON chemin : un ralentissement ou une panne chez Mollie ferait expirer son
     appel HTTP (30 s) et les ventes du site cesseraient d'entrer au classement des primes.
     Un confort d'affichage ne doit pas pouvoir casser une chaîne qui marche.

     Plafonné à 60 relectures par appel, et par paquets de 6 : au-delà, l'onglet de suivi
     n'a de toute façon plus besoin d'être enrichi (les lignes anciennes sont déjà écrites,
     et l'écriture est définitive). Chaque échec rend `null` et retombe sur le libellé
     générique — jamais d'erreur propagée. */
  const moyenParReference = new Map<string, string>();
  if (req.nextUrl.searchParams.get("moyen") === "detail") {
    const refs = [...new Set(
      (ventes ?? [])
        .map((v: any) => String(parVente.get(String(v.id))?.reference_paiement ?? ""))
        .filter((r) => r.startsWith("tr_")),
    )].slice(0, 60);
    for (let i = 0; i < refs.length; i += 6) {
      const lot = refs.slice(i, i + 6);
      const res = await Promise.all(lot.map((r) => lireMoyen(r)));
      lot.forEach((r, k) => {
        const m = res[k];
        if (m) moyenParReference.set(r, m);
      });
    }
  }

  const out = (ventes ?? []).map((v: any) => {
    const p = parVente.get(String(v.id)) ?? {};
    const c = parCandidat.get(String(v.candidat_id)) ?? {};
    const f = parFacture.get(String(v.id)) ?? null;
    const cmd = p.commande_id ? parCommande.get(String(p.commande_id)) : null;
    const sess = v.sessions_examen ?? null;
    const estPlateforme = v.type_examen === "Vente_plateforme";
    const montant = Number(v.montant ?? 0);

    const rue = String(p.adresse ?? "").trim();
    const cpVille = `${String(p.code_postal ?? "").trim()} ${String(p.ville ?? "").trim()}`.trim();
    const bouts = [rue, cpVille].filter((s) => s !== "");
    if (p.pays && p.pays !== "France") bouts.push(String(p.pays));

    /* La MARQUE D'IDEMPOTENCE. Le numéro d'attestation ne peut pas servir de clé : le
       compteur du CRM (`seq_attestation_examen`, 1524 le 09/10/2026) et celui du robot
       n8n (max de la colonne AC, 2560 le même jour) distribuent les mêmes numéros
       `MYS-2026-…` sans se parler. Deux lignes peuvent donc porter le même numéro sans
       être la même vente. Ce jeton, lui, ne désigne qu'une vente et une seule. */
    const marque = `réf-site:${String(v.id).slice(0, 8)}`;

    const origine =
      cmd?.moyen_paiement === "lenbox"
        ? "Vente en ligne (site) — financée en plusieurs fois (Lenbox)"
        : "Vente en ligne (site) — réglée par carte (Mollie)";

    return {
      /* Vocabulaire du sous-robot `UTIL — MAJ ligne Examens v2`, à la lettre. */
      operation: "inscription",
      row_number: 0, // inutile pour un ajout : le garde-fou du sous-robot ne le lit qu'en mise à jour

      date_inscription: jjmmaaaa(v.date_inscription),
      agence: v.agence ?? "Rosny",
      type_examen: TYPE_ONGLET[v.type_examen] ?? v.type_examen,
      sous_type: v.sous_type ?? "",
      date_examen: estPlateforme ? "—" : jjmmaaaa(sess?.date_examen),
      horaire: estPlateforme ? "—" : (sess?.horaire ?? ""),
      plateforme: p.plateforme ?? "",
      nom: c.nom ?? "",
      civilite: p.civilite === "Madame" ? "Mme" : p.civilite === "Monsieur" ? "M." : "",
      prenom: c.prenom ?? "",
      /* Colonne K. Gagny n'accueille plus aucun examen depuis le 28/09/2026 : le
         sous-robot lui-même renvoie « Rosny » quelle que soit la date. Une vente de
         plateforme n'a pas de centre, comme pour les ventes des conseillères. */
      centre: estPlateforme ? "" : "Rosny",
      genre: p.genre ?? "",
      date_naissance: jjmmaaaa(p.date_naissance),
      lieu_naissance: p.lieu_naissance ?? "",
      langue_maternelle: p.langue_maternelle ?? "",
      nationalite: p.nationalite ?? "",
      telephone: c.telephone ?? p.candidat_telephone ?? "",
      email: c.email ?? "",
      adresse_complete: bouts.join(", "),
      code_postal: p.code_postal ?? "",
      ville: p.ville ?? "",
      pays: p.pays ?? "France",
      piece_identite: p.piece_identite ?? "",
      vendu_par: v.vendu_par ?? "Aru",
      montant,
      paiement: modePaiement(cmd?.moyen_paiement ?? null, p.reference_paiement ?? null),
      /* Colonne AA « dont CB » : 0, comme toutes les lignes non mixtes du classeur.
         Elle ne sert qu'à ventiler un paiement Mixte espèces/carte. */
      montant_cb: 0,
      statut_paiement: v.statut_paiement,
      numero_attestation: v.numero_attestation,
      /* Colonne AE. 1 % du montant encaissé (règle du 18/09/2026). Elle est
         informative : le robot des primes recalcule le pourcentage lui-même. */
      prime: Math.round(montant) / 100,
      commentaire: `${origine}${f?.numero ? ` · facture ${f.numero}` : ""} · ${marque}`,

      /* ── HORS GABARIT ──────────────────────────────────────────────────────────────
         Tout champ préfixé `_` est IGNORÉ par le robot des primes : son nœud de
         rapprochement saute les clés commençant par `_` avant de passer la ligne au
         sous-robot d'écriture, qui exige exactement 32 colonnes. C'est ce qui rend ces
         ajouts sans danger pour lui — et c'est la raison de la convention : un champ
         nouveau se nomme `_…`, jamais autrement, sous peine de casser le gabarit A→AF. */
      _marque: marque,
      _vente_id: v.id,
      _facture: f?.numero ?? null,
      _facture_envoyee_le: f?.email_envoye_le ?? null,

      /* ── POUR L'ONGLET « Paiements site » (09/10/2026) ─────────────────────────────
         Un suivi de PAIEMENTS, pas un second journal de ventes : ce qui compte est
         l'encaissement — quand, par quel moyen, sous quelle référence — et à quelles
         pièces légales il se rattache. */

      /* La date de l'ENCAISSEMENT, pas celle de l'inscription. Les deux diffèrent :
         `date_inscription` est une date de gestion (jour de la conversion), `paye_le` est
         l'instant où l'argent est parti du compte du candidat. C'est `paye_le` qui se
         rapproche du relevé Mollie et du versement Qonto. La commande fait foi quand elle
         existe : c'est elle qui porte LE paiement unique d'une commande composée. */
      _paye_le: jjmmaaaaHeure(cmd?.paye_le ?? p.paye_le ?? null),
      /* La référence du paiement : `tr_…` chez Mollie, identifiant de dossier chez Lenbox.
         C'est la seule chaîne qui permette de retrouver l'encaissement chez le
         prestataire — donc la clé du rapprochement bancaire. */
      _reference_paiement: p.reference_paiement ?? "",
      _moyen: moyenLisible(
        cmd?.moyen_paiement ?? null,
        p.reference_paiement ?? null,
        moyenParReference.get(String(p.reference_paiement ?? "")) ?? null,
      ),
      /* Lenbox distingue la SESSION (créée au clic) de la DEMANDE (notifiée au
         financement) : conserver l'identifiant de session est ce qui permet de vérifier
         qu'un dossier financé correspond bien à cette commande et pas à celle d'un tiers. */
      _lenbox_session: cmd?.lenbox_session_id ?? "",
      /* Le détail de la commande composée, et son total. Rendus pour que trois lignes de
         suivi issues d'UN SEUL paiement ne se lisent pas comme trois encaissements. */
      _commande_detail: detailCommande(cmd?.detail),
      _commande_total: cmd?.montant != null ? Number(cmd.montant) : null,
      /* La série de facturation telle qu'elle est en base, et le numéro émis. L'écart
         entre les deux est exactement ce que l'onglet doit rendre visible : une facture
         d'examen numérotée `MYS-2026-…` a pris son numéro dans la séquence des
         ATTESTATIONS, alors qu'elle devrait porter `MYS-EX-2026-…`. */
      _facture_serie: f?.serie ?? "",
      _facture_statut: f?.statut ?? "",
    };
  });

  /* LE SEUL POINT DE SORTIE. Tout ce qui est texte passe par `texteSheet`, ici et
     nulle part ailleurs : une valeur ajoutée plus tard au gabarit sera neutralisée
     sans que personne ait à y penser. Les champs numériques sont laissés tels quels,
     sinon le classeur recevrait « 185 » au lieu de 185 et les primes s'additionneraient
     comme du texte. */
  const propre = out.map((ligne) =>
    Object.fromEntries(
      Object.entries(ligne).map(([cle, valeur]) => [
        cle,
        typeof valeur === "string" && !CHAMPS_NUMERIQUES.includes(cle)
          ? texteSheet(valeur)
          : valeur,
      ]),
    ),
  );

  return NextResponse.json({ ok: true, ventes: propre });
}
