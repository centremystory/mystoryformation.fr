// app/api/dossiers/depuis-vente/route.ts
//
// POURQUOI CETTE ROUTE EXISTE — mesuré le 09/10/2026 :
//   158 ventes de formation en base, 4 dossiers (dont 3 à 1 h et 0 €, donc des essais),
//   56 pièces toutes au statut « manquant », 0 émargement, 0 convention signée depuis juillet.
//
// La chaîne Qualiopi du CRM est complète et correcte : les 16 pièces se sèment seules
// (trigger `trg_dossiers_seed_pieces`), la convention part en signature DocuSeal, l'émargement
// respecte la jurisprudence, le certificat refuse l'antidate. Rien de tout cela ne manquait.
// Ce qui manquait, c'est LE CHEMIN : avant cette route, un seul fichier du dépôt insérait
// dans `dossiers` — `lib/edofCreation.ts`, l'import d'un export EDOF. Aucune route, aucun
// bouton ne transformait une vente en dossier. Les 158 ventes ne produisaient 0 dossier
// parce qu'il n'existait littéralement pas de chemin entre les deux.
//
// Ce que fait cette route, et c'est tout ce qu'elle fait : elle crée le dossier. Derrière,
// la chaîne s'allume d'elle-même — les 14 pièces obligatoires apparaissent, la convention
// devient envoyable, l'émargement devient possible, le certificat devient émettable.
//
// CE QU'ELLE N'ENVOIE PAS, ET VOLONTAIREMENT :
//   — aucun courriel. Ni au stagiaire, ni à personne.
//   — elle ne touche JAMAIS `declencher_contractualisation`. Ce drapeau déclenche le robot
//     n8n `mystory-contractualisation` (trigger `trg_contractualisation`), qui envoie des
//     documents. Créer un dossier ne doit pas faire partir du courrier : c'est la conseillère
//     qui décidera, plus tard, depuis la page Dossiers.
//
// CE QUE LA CONSEILLÈRE SAISIT — trois champs, et trois seulement, parce que tout le reste
// est déjà connu de la vente et ne doit jamais être resaisi :
//   niveau visé (liste) · centre (liste, pré-remplie depuis l'agence de vente) · date de début.
// Les heures, le montant, le financement, le vendeur et la date de commande sont repris
// de la ligne de vente. Les heures ne sont demandées que si la formule n'en porte pas
// (c'est le cas des lignes « Fond propre », qui n'ont pas de durée).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { journal } from "@/lib/examens";
import { rattacherTestAuDossier } from "@/lib/rattacherTest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Niveaux acceptés par la contrainte `dossiers_niveau_vise_check`. */
const NIVEAUX_VISES = ["A1", "A2", "B1", "B2"] as const;

/**
 * Plafond CPF porté par la contrainte `chk_plafond_cpf` : au-delà de 1 500 €, un dossier
 * CPF n'est accepté que si le reste à charge a été accepté par le stagiaire. Notre
 * catalogue 2026 est à 1 620 € : la case est donc la règle, pas l'exception.
 */
const PLAFOND_CPF = 1500;

type Corps = {
  venteId?: unknown;
  niveauVise?: unknown;
  centre?: unknown;
  dateDebut?: unknown;
  heures?: unknown;
  resteAChargeAccepte?: unknown;
};

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  // Créer un dossier est un acte administratif adossé à une vente : conseillères
  // (commercial), secrétariat (back_office), encadrement. Pas les formatrices, qui ne
  // vendent pas. `requireRole` laisse passer le filet équipe et les automates.
  let u;
  try {
    u = await requireRole(req, ["direction", "manager", "commercial", "back_office"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Action réservée à l'équipe commerciale, au secrétariat et à la direction." }, { status: 403 });
    throw e;
  }
  const auteur = u.email ?? u.nom ?? null;

  let corps: Corps;
  try { corps = (await req.json()) as Corps; }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const venteId = txt(corps.venteId);
  if (!venteId) return NextResponse.json({ ok: false, erreur: "venteId requis." }, { status: 400 });

  // 1) La vente. C'est elle qui porte tout ce qu'on ne redemandera pas.
  const { data: vente, error: eV } = await supabaseAdmin
    .from("ventes_formation")
    .select("id, stagiaire_id, nom, prenom, heures, montant_eur, fond_propre, agence_vente, formule_label, date_inscription, vendu_par, actif")
    .eq("id", venteId)
    .maybeSingle();
  if (eV) return NextResponse.json({ ok: false, erreur: eV.message }, { status: 500 });
  if (!vente) return NextResponse.json({ ok: false, erreur: "Vente introuvable." }, { status: 404 });
  if (vente.actif === false) return NextResponse.json({ ok: false, erreur: "Cette ligne de vente est archivée." }, { status: 409 });
  if (!vente.stagiaire_id) {
    return NextResponse.json({
      ok: false,
      erreur: "Cette vente n'est rattachée à aucun client. Rattachez-la d'abord à une fiche client.",
    }, { status: 409 });
  }

  // 2) Idempotence. L'index unique partiel `dossiers_vente_formation_unique` refuserait de
  //    toute façon le doublon côté base ; on le vérifie d'abord pour rendre la main avec un
  //    message utile (et le lien vers le dossier déjà créé) plutôt qu'avec une erreur SQL.
  const { data: deja } = await supabaseAdmin
    .from("dossiers")
    .select("id")
    .eq("vente_formation_id", venteId)
    .maybeSingle();
  if (deja?.id) {
    return NextResponse.json({
      ok: false, deja: true, dossierId: deja.id,
      erreur: "Le dossier de cette vente existe déjà.",
    }, { status: 409 });
  }

  // 3) Les trois saisies.
  const niveauVise = txt(corps.niveauVise).toUpperCase();
  if (!NIVEAUX_VISES.includes(niveauVise as (typeof NIVEAUX_VISES)[number])) {
    return NextResponse.json({ ok: false, erreur: `Niveau visé requis (${NIVEAUX_VISES.join(", ")}).` }, { status: 400 });
  }

  const centre = txt(corps.centre).toUpperCase();
  if (!centre) return NextResponse.json({ ok: false, erreur: "Centre requis." }, { status: 400 });
  // On relit la table `centres` au lieu de figer une liste : le FK `dossiers_centre_fk`
  // la fait respecter de toute façon, et c'est elle qui dit quels centres existent
  // vraiment (Pantin, retiré le 06/10, est refusé par cette simple lecture).
  const { data: centreRow } = await supabaseAdmin
    .from("centres").select("code").eq("code", centre).maybeSingle();
  if (!centreRow) return NextResponse.json({ ok: false, erreur: `Centre inconnu : ${centre}.` }, { status: 400 });

  const dateDebut = txt(corps.dateDebut);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) {
    return NextResponse.json({ ok: false, erreur: "Date de début requise (JJ/MM/AAAA)." }, { status: 400 });
  }

  // 4) Les heures : celles de la formule, sinon celles saisies. `heures_prevues` est
  //    NOT NULL et strictement positif côté base — sans durée fiable on n'invente pas.
  const heuresVente = vente.heures == null ? null : Number(vente.heures);
  const heuresSaisies = corps.heures == null || txt(corps.heures) === "" ? null : Number(corps.heures);
  const heures = heuresVente && heuresVente > 0 ? heuresVente : heuresSaisies;
  if (!heures || !Number.isFinite(heures) || heures <= 0) {
    return NextResponse.json({
      ok: false, erreur: `La formule « ${vente.formule_label ?? "—"} » ne porte pas de durée : indiquez le nombre d'heures.`,
      heuresManquantes: true,
    }, { status: 400 });
  }

  // 5) Financement déduit de la vente — jamais resaisi.
  const fondPropre = vente.fond_propre === true;
  const financement = fondPropre ? "Perso" : "CPF";
  const origineFonds = fondPropre ? "Particulier" : "CPF_CDC";
  const montant = vente.montant_eur == null ? 0 : Number(vente.montant_eur);

  // Plafond CPF : la base refuse un dossier CPF au-delà de 1 500 € sans acceptation du
  // reste à charge. On le dit en clair AVANT, plutôt que de laisser remonter une violation
  // de contrainte que personne ne saurait lire.
  const resteAChargeAccepte = corps.resteAChargeAccepte === true;
  if (financement === "CPF" && montant > PLAFOND_CPF && !resteAChargeAccepte) {
    return NextResponse.json({
      ok: false, resteAChargeRequis: true, montant,
      erreur: `Dossier CPF à ${montant.toLocaleString("fr-FR")} € : au-delà de ${PLAFOND_CPF} €, le reste à charge doit avoir été accepté par le stagiaire. Cochez la case pour confirmer qu'il l'a accepté.`,
    }, { status: 409 });
  }

  // 6) Création. Tout le reste tient dans les valeurs par défaut de la table
  //    (type_action = formation, objectif_formation = certifiante, specialite_nsf = 136).
  //    `cree_par` reste NULL : c'est un FK vers auth.users, et les comptes du CRM vivent
  //    dans la table `utilisateurs` — l'auteur est tracé dans le journal, pas ici.
  //    (C'est aussi le bug qui rendait `lib/edofCreation.ts` inapplicable : il y écrivait
  //    la chaîne "import_edof", refusée comme uuid invalide.)
  const { data: cree, error: eI } = await supabaseAdmin
    .from("dossiers")
    .insert({
      stagiaire_id: vente.stagiaire_id,
      vente_formation_id: vente.id,
      certif: "TEF_IRN",
      financement,
      origine_fonds: origineFonds,
      montant,
      heures_prevues: heures,
      niveau_vise: niveauVise,
      centre,
      date_debut: dateDebut,
      date_validation_commande: vente.date_inscription ?? null,
      vendu_par: vente.vendu_par ?? null,
      statut: "incomplet",
      reste_a_charge_accepte: resteAChargeAccepte,
    })
    .select("id")
    .single();

  if (eI || !cree?.id) {
    return NextResponse.json({ ok: false, erreur: eI?.message ?? "Création impossible." }, { status: 500 });
  }

  await journal("dossiers", cree.id, "cree_depuis_vente", {
    vente_formation_id: vente.id,
    niveau_vise: niveauVise, centre, date_debut: dateDebut,
    heures_prevues: heures, montant, financement,
  }, auteur);

  // 7) Si la personne a déjà passé le test de positionnement en ligne, on le rattache tout
  //    de suite : le niveau d'entrée et la pièce « évaluation initiale » n'ont plus à être
  //    ressaisis. Best-effort — un rattachement qui échoue ne doit jamais faire échouer
  //    la création du dossier.
  let testRattache = false;
  try {
    const r = await rattacherTestAuDossier(cree.id, auteur);
    testRattache = r?.ok === true;
  } catch { /* non bloquant */ }

  // Combien de pièces le trigger a semées : c'est la preuve, côté conseillère, que la
  // liasse Qualiopi existe désormais pour ce dossier.
  const { count: nbPieces } = await supabaseAdmin
    .from("pieces").select("id", { count: "exact", head: true }).eq("dossier_id", cree.id);

  return NextResponse.json({
    ok: true,
    dossierId: cree.id,
    pieces: nbPieces ?? 0,
    testRattache,
    heures, montant, financement, centre, niveauVise, dateDebut,
  });
}
