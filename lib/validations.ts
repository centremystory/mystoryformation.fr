/**
 * MYSTORY — Validation Direction (point 26, bloc E)
 * --------------------------------------------------
 * File d'attente unique pour 3 actions sensibles : remise hors CPF, sous-traitance,
 * émission de facture hors CPF. Un rôle individuel NON-Direction crée une demande
 * `en_attente` (l'action n'est PAS exécutée) ; la Direction approuve depuis /validations
 * et c'est SEULEMENT à ce moment que le serveur exécute réellement l'action
 * (numéro de facture attribué à l'approbation → zéro antidate). Refus → rien n'est appliqué.
 *
 * La Direction (et le filet de transition : session équipe "staff" / token de service sans
 * rôle) agit directement, sans passer par cette file (cf. estDirection dans lib/roles).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { facturerDossier, facturerVente, facturerGroupe, envoyerFacture } from "@/lib/factures";

export type TypeValidation = "remise_hors_cpf" | "sous_traitance" | "facture_hors_cpf";

export const LABEL_TYPE_VALIDATION: Record<TypeValidation, string> = {
  remise_hors_cpf: "Remise hors CPF",
  sous_traitance: "Sous-traitance",
  facture_hors_cpf: "Facture hors CPF",
};

export interface DemandeValidation {
  type: TypeValidation;
  libelle: string;
  payload: Record<string, unknown>;
  demandeur?: string | null;
}

/** Crée une demande en attente de validation Direction. Retourne l'id, ou lève une erreur. */
export async function demanderValidation(d: DemandeValidation): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("validations_direction")
    .insert({
      type: d.type,
      libelle: d.libelle.slice(0, 300),
      payload: d.payload,
      demande_par: d.demandeur ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await journal("validation", (data as any).id, "validation_demandee",
    { type: d.type, libelle: d.libelle }, d.demandeur ?? null);
  return { id: (data as any).id };
}

/**
 * Exécute réellement l'action portée par une demande approuvée.
 * Appelé UNIQUEMENT depuis l'approbation. Lève une erreur si l'exécution échoue
 * (l'appelant laisse alors la demande en_attente plutôt que de la marquer approuvée à tort).
 * Retourne le résultat à stocker dans `resultat`.
 */
export async function appliquerValidation(
  row: { id: string; type: TypeValidation; payload: any; demande_par: string | null },
  approbateur: string | null,
): Promise<Record<string, unknown>> {
  const auteur = approbateur ?? "validation-direction";
  const p = row.payload ?? {};

  if (row.type === "remise_hors_cpf") {
    const dossierId = String(p.dossierId ?? "");
    if (!dossierId) throw new Error("Demande remise : dossier manquant.");
    // Garde-fou : jamais de remise sur un dossier CPF (anti-démarchage), même au moment de l'application.
    const { data: d } = await supabaseAdmin
      .from("dossiers").select("financement, origine_fonds, montant").eq("id", dossierId).maybeSingle();
    if (!d) throw new Error("Dossier introuvable.");
    if ((d as any).origine_fonds === "CPF_CDC" || (d as any).financement === "CPF")
      throw new Error("Remise impossible : le dossier est devenu CPF.");
    const remise = Math.round(Number(p.remise ?? 0) * 100) / 100;
    const plafond = Number((d as any).montant ?? 0);
    if (!(remise > 0)) throw new Error("Montant de remise invalide.");
    if (remise > plafond) throw new Error("La remise dépasse le montant de la formation.");
    const remiseMotif = p.remiseMotif ? String(p.remiseMotif) : null;
    const { error } = await supabaseAdmin
      .from("dossiers").update({ remise, remise_motif: remiseMotif }).eq("id", dossierId);
    if (error) throw new Error(error.message);
    await journal("dossier", dossierId, "remise_validee",
      { remise, remise_motif: remiseMotif, demande_par: row.demande_par }, auteur);
    return { dossierId, remise };
  }

  if (row.type === "sous_traitance") {
    const ligne = {
      sens: p.sens === "recue" ? "recue" : "confiee",
      prestataire: String(p.prestataire ?? "").trim(),
      annee: Number(p.annee),
      montant: Number(p.montant),
      facture_ref: p.facture_ref ? String(p.facture_ref) : null,
      contrat_ref: p.contrat_ref ? String(p.contrat_ref) : null,
      attestation_anti_demarchage: !!p.attestation_anti_demarchage,
      note: p.note ? String(p.note) : null,
    };
    if (!ligne.prestataire || !Number.isInteger(ligne.annee) || !(ligne.montant >= 0))
      throw new Error("Sous-traitance : prestataire, année et montant valides requis.");
    const { data, error } = await supabaseAdmin
      .from("sous_traitance").insert(ligne).select("id").single();
    if (error) throw new Error(error.message);
    await journal("sous_traitance", (data as any).id, "ajout",
      { ...ligne, demande_par: row.demande_par, valide_par: auteur }, auteur);
    return { id: (data as any).id };
  }

  if (row.type === "facture_hors_cpf") {
    const envoyer = p.envoyer !== false;
    let f;
    if (p.kind === "groupe") {
      f = await facturerGroupe(p.items, auteur);
    } else if (p.kind === "vente") {
      f = await facturerVente(String(p.venteId), auteur);
    } else if (p.kind === "dossier") {
      f = await facturerDossier(String(p.dossierId), auteur);
    } else {
      throw new Error("Demande facture : cible inconnue.");
    }
    let email: { envoye: boolean; erreur?: string } = { envoye: false };
    if (envoyer) {
      const envoi = await envoyerFacture(f.id, "emission", auteur);
      email = envoi.ok ? { envoye: true } : { envoye: false, erreur: envoi.erreur };
    }
    return { factureId: f.id, numero: f.numero, montant: f.montant, client: f.client, email };
  }

  throw new Error("Type de validation inconnu.");
}
