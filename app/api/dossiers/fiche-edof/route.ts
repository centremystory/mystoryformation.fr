/**
 * MYSTORY — GET /api/dossiers/fiche-edof?dossier=<id>
 * Assemble TOUTES les valeurs à recopier dans EDOF (Mon Compte Formation), dans l'ordre,
 * + les contrôles de conformité (délai 11 j ouvrés, n° EDOF, lieu Gagny).
 * EDOF n'a PAS d'API → l'inscription reste un clic humain ; ici on pré-prépare la saisie.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { joursOuvresEntre, DELAI_ACCES_JOURS_OUVRES } from "@/lib/inscriptions/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIEU_GAGNY = "3 bis avenue de Gagny, 93220 Gagny";
const CERTIF: Record<string, { code: string; intitule: string; certificateur: string }> = {
  TEF_IRN: { code: "RS6775", intitule: "TEF IRN — Test d'évaluation de français (accès à la nationalité, l'intégration et la résidence)", certificateur: "CCI Paris IDF / Le Français des Affaires" },
  LEVELTEL: { code: "RS6427", intitule: "LEVELTEL — Test de niveau de français à l'oral et à l'écrit", certificateur: "LEVELTEL" },
};

function jjmmaaaa(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  if (isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const id = req.nextUrl.searchParams.get("dossier")?.trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "Paramètre 'dossier' requis." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select(`
      id, certif, financement, montant, numero_edof, session_edof,
      heures_prevues, date_debut, date_fin, date_validation_commande,
      niveau_initial, niveau_vise,
      stagiaire:stagiaires!inner (civilite, nom, prenom, date_naissance, ville_naissance, adresse, cp, ville, email, telephone)
    `)
    .eq("id", id).single();
  if (error || !data) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const d = data as any;
  const s = d.stagiaire;
  const c = CERTIF[d.certif] ?? { code: d.certif ?? "—", intitule: d.certif ?? "—", certificateur: "—" };
  const adresse = [s.adresse, [s.cp, s.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const champs = [
    { label: "Code certification visée", valeur: c.code, copiable: true },
    { label: "Intitulé certification", valeur: c.intitule, copiable: true },
    { label: "Certificateur", valeur: c.certificateur, copiable: false },
    { label: "Civilité", valeur: s.civilite ?? "", copiable: true },
    { label: "Nom", valeur: s.nom ?? "", copiable: true },
    { label: "Prénom", valeur: s.prenom ?? "", copiable: true },
    { label: "Date de naissance", valeur: jjmmaaaa(s.date_naissance), copiable: true },
    { label: "Ville de naissance", valeur: s.ville_naissance ?? "", copiable: true },
    { label: "Email", valeur: s.email ?? "", copiable: true },
    { label: "Téléphone", valeur: s.telephone ?? "", copiable: true },
    { label: "Adresse", valeur: adresse, copiable: true },
    { label: "Date de début", valeur: jjmmaaaa(d.date_debut), copiable: true },
    { label: "Date de fin prévisionnelle", valeur: jjmmaaaa(d.date_fin), copiable: true },
    { label: "Durée totale (heures)", valeur: d.heures_prevues != null ? String(d.heures_prevues) : "", copiable: true },
    { label: "Tarif", valeur: d.montant != null ? `${d.montant} €` : "", copiable: true },
    { label: "Lieu de formation", valeur: LIEU_GAGNY, copiable: true },
    { label: "Modalité", valeur: "Présentiel — entrée/sortie permanente", copiable: true },
    { label: "N° dossier EDOF", valeur: d.numero_edof ?? "", copiable: true, vide: !d.numero_edof },
  ];

  // Contrôles de conformité
  const controles: Array<{ label: string; ok: boolean; detail: string }> = [];
  if (d.date_validation_commande && d.date_debut) {
    const jo = joursOuvresEntre(new Date(d.date_validation_commande), new Date(d.date_debut));
    controles.push({
      label: `Délai d'accès ≥ ${DELAI_ACCES_JOURS_OUVRES} jours ouvrés`,
      ok: jo >= DELAI_ACCES_JOURS_OUVRES,
      detail: `${jo} jour(s) ouvré(s) entre la validation (${jjmmaaaa(d.date_validation_commande)}) et le 1er cours (${jjmmaaaa(d.date_debut)})`,
    });
  } else {
    controles.push({ label: `Délai d'accès ≥ ${DELAI_ACCES_JOURS_OUVRES} jours ouvrés`, ok: false, detail: "Date de validation de commande ou date de début manquante." });
  }
  controles.push({ label: "N° de dossier EDOF renseigné", ok: !!d.numero_edof, detail: d.numero_edof ? d.numero_edof : "À reporter dans le CRM après création sur EDOF." });
  controles.push({ label: "Lieu de formation = Gagny", ok: true, detail: LIEU_GAGNY });

  const rappels = [
    "La durée en heures doit être IDENTIQUE sur EDOF et sur tous les documents.",
    "Ne jamais antidater. Le NDA ne vaut pas agrément de l'État.",
    "Après création sur EDOF, reporter le n° de dossier dans le CRM.",
  ];

  return NextResponse.json({
    ok: true,
    dossierId: d.id,
    stagiaire: { nom: s.nom, prenom: s.prenom },
    financement: d.financement,
    champs, controles, rappels,
  });
}
