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
 * ── CE QU'ELLE NE REND PAS ──────────────────────────────────────────────────────
 * Les ventes remboursées ou annulées. Le classeur se corrige alors ligne par ligne
 * (opérations `remboursement` / `annulation` du sous-robot), pas en ajoutant une
 * ligne de plus. Une vente du site remboursée reste donc à traiter à la main — c'est
 * assumé : fabriquer un correctif automatique sur une ligne qu'on n'a pas encore
 * écrite serait inventer un problème avant de l'avoir.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * La seule marque fiable dont on dispose : `reference_paiement`. Mollie préfixe tous
 * ses paiements par `tr_`, Lenbox rend l'identifiant de son dossier. Quand la vente
 * vient d'une commande composée, `commandes_en_ligne.moyen_paiement` le dit en clair
 * et fait foi — on le préfère.
 *
 * ⚠️ « CB » est conservé en tête du libellé : c'est le seul vocabulaire que les
 * anciennes lignes du classeur emploient, et l'agrégation des primes ne regarde cette
 * colonne que pour y chercher « cpf ». Préciser le prestataire derrière ne casse rien
 * et rend la ligne lisible pour un humain.
 */
function modePaiement(moyenCommande: string | null, reference: string | null): string {
  if (moyenCommande === "lenbox") return "CB — paiement fractionné (Lenbox)";
  if (moyenCommande === "mollie") return "CB en ligne (Mollie)";
  if (reference && reference.startsWith("tr_")) return "CB en ligne (Mollie)";
  if (reference) return "CB — paiement fractionné (Lenbox)";
  return "CB en ligne";
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
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
        "piece_identite, plateforme, reference_paiement, candidat_telephone",
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
    .select("vente_id, numero, email_envoye_le")
    .in("vente_id", idsVente);
  const parFacture = new Map<string, any>();
  for (const f of factures ?? []) parFacture.set(String((f as any).vente_id), f);

  const idsCommande = [...new Set((pres ?? []).map((p: any) => p.commande_id).filter(Boolean))];
  const { data: commandes } = await supabaseAdmin
    .from("commandes_en_ligne")
    .select("id, moyen_paiement")
    .in("id", idsCommande.length ? idsCommande : ["00000000-0000-0000-0000-000000000000"]);
  const parCommande = new Map<string, any>();
  for (const c of commandes ?? []) parCommande.set(String((c as any).id), c);

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

      /* Hors gabarit : lu par le robot pour sa déduplication et ses alertes. */
      _marque: marque,
      _vente_id: v.id,
      _facture: f?.numero ?? null,
      _facture_envoyee_le: f?.email_envoye_le ?? null,
    };
  });

  return NextResponse.json({ ok: true, ventes: out });
}
