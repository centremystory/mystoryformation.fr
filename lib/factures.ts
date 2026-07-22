/**
 * MYSTORY — lib/factures.ts  (facturation §6, règle du 05/06/2026)
 * · Vente d'examen : facture À LA VENTE (appel automatique depuis /api/examens/ventes).
 * · Dossier formation : facture à l'inscription pour les payeurs directs ; pour un
 *   financement CPF, VERROU : pas de facture avant `service_fait_valide` (la CDC règle
 *   après validation du service fait — art. L.6323-12 du Code du travail). Choix documenté.
 * · Idempotent : une facture existe déjà pour l'entité → elle est renvoyée telle quelle
 *   (la contrainte SQL `facture_une_entite` + index uniques verrouillent aussi côté base).
 * · Numéro FAC-AAAA-NNNNN attribué PAR LE SERVEUR (trigger `trg_factures_before`),
 *   séquentiel sans trou, immuable, DELETE interdit — document comptable.
 * · PDF archivé dans `documents/factures/<id>.pdf` (regénérable à tout moment).
 * · Relances J+7 (relance_1) et J+15 (relance_2) — jamais pour un dossier CPF
 *   (le payeur est la CDC, pas le stagiaire).
 */
import { renderHtmlToPdf } from "@/lib/docuseal";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { fusionExamen, valeursCachet, dateFR, aujourdHuiFR, journal } from "@/lib/examens";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getParamNumber } from "@/lib/parametres";

const LIBELLE_CERTIF: Record<string, string> = {
  TEF_IRN: "Formation Français — préparation au TEF IRN (certification RS6775)",
  LEVELTEL: "Formation Français professionnel — LEVELTEL FLE (certification RS6427)",
};

const LIBELLE_EXAMEN: Record<string, string> = {
  TEF_IRN: "Inscription à l'examen TEF IRN (centre d'examen MYSTORY — Gagny)",
  Examen_civique: "Inscription à l'examen civique (centre d'examen MYSTORY — Gagny)",
  Vente_plateforme: "Accès à une application d'entraînement",
};

export interface FactureCreee {
  id: string;
  numero: string;
  montant: number;
  client: string;
  dejaExistante: boolean;
  pdf: Buffer;
}

function adresseClient(s: any): string {
  if (!s) return "";
  return [s.adresse, [s.cp, s.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** Rend le PDF de la facture depuis le gabarit, l'archive en storage, et le renvoie. */
async function rendreEtArchiver(
  facture: any,
  clientAdresse: string,
  reglement: string,
  mentionCpf: boolean,
): Promise<Buffer> {
  const estPayee = facture.statut === "payée";
  const html = fusionExamen("facture", {
    ...valeursCachet(),
    numero: facture.numero,
    date_emission: dateFR(facture.date_emission) || aujourdHuiFR(),
    client: facture.client ?? "",
    client_adresse: clientAdresse || null,
    reglement,
    est_payee: estPayee ? "1" : null,
    date_paiement: estPayee && facture.date_paiement ? dateFR(facture.date_paiement) : "",
    designation: facture.designation ?? "",
    montant: String(facture.montant ?? ""),
    mention_cpf: mentionCpf ? "1" : null,
  });
  const { pdf } = await renderHtmlToPdf({ html, name: `Facture_${facture.numero}.pdf` });
  const chemin = `factures/${facture.id}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from("documents")
    .upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Archivage de la facture : ${error.message}`);
  return pdf;
}

/** Charge une facture avec son contexte (dossier+stagiaire OU vente+candidat). */
export async function chargerFacture(factureId: string): Promise<{
  facture: any;
  destinataire: any | null;     // stagiaire/candidat (email, adresse…)
  reglement: string;
  estCpf: boolean;
} | null> {
  const { data: f } = await supabaseAdmin.from("factures").select("*").eq("id", factureId).maybeSingle();
  if (!f) return null;

  if ((f as any).dossier_id) {
    const { data: d } = await supabaseAdmin
      .from("dossiers").select("*, stagiaires:stagiaire_id (*)").eq("id", (f as any).dossier_id).maybeSingle();
    const estCpf = (d as any)?.origine_fonds === "CPF_CDC" || (d as any)?.financement === "CPF";
    const reglement = estCpf
      ? "CPF — Caisse des Dépôts et Consignations (service fait validé EDOF)"
      : ((d as any)?.origine_fonds ?? (d as any)?.financement ?? "Paiement direct");
    return { facture: f, destinataire: (d as any)?.stagiaires ?? null, reglement, estCpf };
  }

  const { data: v } = await supabaseAdmin
    .from("ventes_examen").select("*, stagiaires:candidat_id (*)").eq("id", (f as any).vente_id).maybeSingle();
  const mode = (v as any)?.mode_paiement ?? "";
  const inclusCpf = (v as any)?.statut_paiement === "Inclus CPF";
  const reglement = inclusCpf
    ? "Inclus dans le parcours CPF"
    : mode ? `Paiement ${mode.toLowerCase()}` : "Paiement direct";
  // « Inclus CPF » : le règlement suit le parcours CPF → jamais de relance au candidat.
  return { facture: f, destinataire: (v as any)?.stagiaires ?? null, reglement, estCpf: inclusCpf };
}

/**
 * Facture une VENTE D'EXAMEN (à la vente — règle du 05/06/2026).
 * Statut « Payé » à la vente → facture directement marquée payée (tampon PAYÉE).
 * Statut « Acompte » → facture émise, relances actives sur le solde.
 */
export async function facturerVente(venteId: string, auteur?: string | null): Promise<FactureCreee> {
  const { data: existante } = await supabaseAdmin.from("factures").select("*").eq("vente_id", venteId).maybeSingle();
  const { data: v } = await supabaseAdmin
    .from("ventes_examen").select("*, stagiaires:candidat_id (*)").eq("id", venteId).maybeSingle();
  if (!v) throw new Error("Vente introuvable.");
  const s = (v as any).stagiaires;
  const mode = (v as any).mode_paiement ?? "";
  const reglement = (v as any).statut_paiement === "Inclus CPF"
    ? "Inclus dans le parcours CPF"
    : mode ? `Paiement ${mode.toLowerCase()}` : "Paiement direct";

  if (existante) {
    const pdf = await rendreEtArchiver(existante, adresseClient(s), reglement, false);
    return { id: (existante as any).id, numero: (existante as any).numero, montant: (existante as any).montant, client: (existante as any).client, dejaExistante: true, pdf };
  }

  const libelle = LIBELLE_EXAMEN[(v as any).type_examen] ?? "Prestation d'examen";
  const designation = `${libelle}${(v as any).sous_type ? ` — ${(v as any).sous_type}` : ""} · attestation ${(v as any).numero_attestation}`;
  const client = `${s?.civilite ?? ""} ${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim();
  const payee = (v as any).statut_paiement === "Payé";

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({
      vente_id: venteId,
      montant: (v as any).montant,
      designation,
      client,
      serie: "TEF_PRODUIT", // numérotation MYS-2026 unifiée (séquence partagée avec l'attestation)
      numero: "ATTRIBUE_PAR_LE_SERVEUR", // remplacé par le trigger (séquence sans trou)
      ...(payee ? { statut: "payée", date_paiement: aujourdHuiParisISO() } : {}),
    })
    .select("*").single();
  if (error) throw new Error(error.message);

  await journal("factures", (facture as any).id, "facture_emise",
    { numero: (facture as any).numero, montant: (v as any).montant, vente: venteId, payee }, auteur ?? null);

  // Ligne de facture structurée (1 ligne examen).
  const { error: eLigne } = await supabaseAdmin.from("facture_lignes").insert({
    facture_id: (facture as any).id, designation, categorie: "examen",
    quantite: 1, prix_unitaire: (v as any).montant, montant: (v as any).montant,
    ref_type: "vente", ref_id: venteId, ordre: 0,
  });
  if (eLigne) console.warn("[factures] ligne examen non écrite:", eLigne.message);

  const pdf = await rendreEtArchiver(facture, adresseClient(s), reglement, false);
  return { id: (facture as any).id, numero: (facture as any).numero, montant: (facture as any).montant, client, dejaExistante: false, pdf };
}

/**
 * Facture un DOSSIER DE FORMATION.
 * VERROU conformité : financement CPF → la facture suit le service fait validé EDOF.
 */
export async function facturerDossier(dossierId: string, auteur?: string | null): Promise<FactureCreee> {
  const { data: existante } = await supabaseAdmin.from("factures").select("*").eq("dossier_id", dossierId).maybeSingle();
  const { data: d } = await supabaseAdmin
    .from("dossiers").select("*, stagiaires:stagiaire_id (*)").eq("id", dossierId).maybeSingle();
  if (!d) throw new Error("Dossier introuvable.");
  const s = (d as any).stagiaires;
  const estCpf = (d as any).origine_fonds === "CPF_CDC" || (d as any).financement === "CPF";
  // Série de numérotation FORMATION : CPF / OPCO / FT (France Travail) / FFP (Fonds propres).
  const serie = estCpf ? "CPF"
    : (d as any).financement === "OPCO" ? "OPCO"
    : (d as any).financement === "PoleEmploi" ? "FT"
    : "FFP";
  const reglement = estCpf
    ? "CPF — Caisse des Dépôts et Consignations (service fait validé EDOF)"
    : ((d as any).origine_fonds ?? (d as any).financement ?? "Paiement direct");

  if (existante) {
    const pdf = await rendreEtArchiver(existante, adresseClient(s), reglement, estCpf);
    return { id: (existante as any).id, numero: (existante as any).numero, montant: (existante as any).montant, client: (existante as any).client, dejaExistante: true, pdf };
  }

  // VERROU conformité : financement CPF → jamais de facture avant le service fait validé.
  if (estCpf && !(d as any).service_fait_valide) {
    throw new Error("Dossier CPF : la facture ne peut être émise qu'après validation du service fait sur EDOF (art. L.6323-12). Valide d'abord le service fait sur le dossier.");
  }

  const intitule = LIBELLE_CERTIF[(d as any).certif] ?? `Formation ${(d as any).certif}`;
  const heures = (d as any).heures_realisees ?? (d as any).heures_prevues;
  // Remise hors CPF reportée : net = montant − remise (jamais de remise sur CPF).
  const montantBrut = Number((d as any).montant ?? 0);
  const remise = estCpf ? 0 : Math.min(Math.max(0, Number((d as any).remise ?? 0)), montantBrut);
  const montantNet = Math.max(0, montantBrut - remise);
  const motifRemise = String((d as any).remise_motif ?? "").trim();
  const mentionRemise = remise > 0
    ? ` · remise ${remise.toLocaleString("fr-FR")} €${motifRemise ? ` (${motifRemise})` : ""} sur ${montantBrut.toLocaleString("fr-FR")} €`
    : "";
  const designation = `${intitule} — ${heures} heures${(d as any).date_debut ? `, du ${dateFR((d as any).date_debut)} au ${dateFR((d as any).date_fin)}` : ""}${(d as any).numero_edof ? ` · dossier EDOF ${(d as any).numero_edof}` : ""}${mentionRemise}`;
  const client = `${s?.civilite ?? ""} ${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim();

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({ dossier_id: dossierId, montant: montantNet, designation, client, serie, numero: "ATTRIBUE_PAR_LE_SERVEUR" })
    .select("*").single();
  if (error) throw new Error(error.message);

  await journal("factures", (facture as any).id, "facture_emise",
    { numero: (facture as any).numero, montant: montantNet, montant_brut: montantBrut, remise: remise || null, dossier: dossierId }, auteur ?? null);

  // Ligne de facture structurée (multi-produits possible à terme ; ici 1 ligne formation).
  const { error: eLigne } = await supabaseAdmin.from("facture_lignes").insert({
    facture_id: (facture as any).id, designation, categorie: "formation",
    quantite: 1, prix_unitaire: montantNet, montant: montantNet,
    ref_type: "dossier", ref_id: dossierId, ordre: 0,
  });
  if (eLigne) console.warn("[factures] ligne formation non écrite:", eLigne.message);

  const pdf = await rendreEtArchiver(facture, adresseClient(s), reglement, estCpf);
  return { id: (facture as any).id, numero: (facture as any).numero, montant: (facture as any).montant, client, dejaExistante: false, pdf };
}

/**
 * Facture GROUPÉE : plusieurs produits d'une MÊME personne sur UNE facture (multi-lignes).
 * Règles : même stagiaire, même série (même payeur) ; CPF exclu (payeur CDC, facture séparée) ;
 * aucun item déjà facturé. La facture groupée ne porte ni dossier_id ni vente_id — ses items
 * sont tracés dans `facture_lignes` (ref_type/ref_id). Numéro selon la série (ex. MYS-2026 examen).
 */
const SERIE_REGLEMENT: Record<string, string> = {
  TEF_PRODUIT: "Paiement direct (examen)", OPCO: "OPCO", FT: "France Travail", FFP: "Fonds propres",
};
export async function facturerGroupe(
  items: Array<{ refType: "dossier" | "vente"; refId: string }>,
  auteur?: string | null,
): Promise<FactureCreee> {
  // Dédoublonnage des items en entrée.
  const uniq = new Map<string, { refType: "dossier" | "vente"; refId: string }>();
  for (const it of items ?? []) {
    if ((it?.refType === "dossier" || it?.refType === "vente") && it.refId) uniq.set(`${it.refType}:${it.refId}`, it);
  }
  const liste = [...uniq.values()];
  if (liste.length < 2) throw new Error("Sélectionne au moins deux produits à regrouper.");

  // Items déjà facturés (entité directe OU ligne d'une facture groupée).
  const { data: dejaEnt } = await supabaseAdmin.from("factures").select("dossier_id, vente_id");
  const { data: dejaLig } = await supabaseAdmin.from("facture_lignes").select("ref_type, ref_id");
  const dejaDossiers = new Set<string>(); const dejaVentes = new Set<string>();
  for (const f of dejaEnt ?? []) { if ((f as any).dossier_id) dejaDossiers.add((f as any).dossier_id); if ((f as any).vente_id) dejaVentes.add((f as any).vente_id); }
  for (const l of dejaLig ?? []) { if ((l as any).ref_type === "dossier" && (l as any).ref_id) dejaDossiers.add((l as any).ref_id); if ((l as any).ref_type === "vente" && (l as any).ref_id) dejaVentes.add((l as any).ref_id); }

  type Desc = { stagiaireId: string; serie: string; designation: string; montant: number; ref_type: string; ref_id: string; categorie: string; stagiaire: any; clientNom: string };
  const descs: Desc[] = [];

  for (const it of liste) {
    if (it.refType === "vente") {
      if (dejaVentes.has(it.refId)) throw new Error("Un examen sélectionné est déjà facturé.");
      const { data: v } = await supabaseAdmin.from("ventes_examen").select("*, stagiaires:candidat_id (*)").eq("id", it.refId).maybeSingle();
      if (!v) throw new Error("Vente d'examen introuvable.");
      if (["Annulé", "Remboursé"].includes((v as any).statut_paiement)) throw new Error("Une vente annulée/remboursée ne peut pas être facturée.");
      const s = (v as any).stagiaires;
      const libelle = LIBELLE_EXAMEN[(v as any).type_examen] ?? "Prestation d'examen";
      descs.push({
        stagiaireId: (v as any).candidat_id, serie: "TEF_PRODUIT", categorie: "examen",
        designation: `${libelle}${(v as any).sous_type ? ` — ${(v as any).sous_type}` : ""} · attestation ${(v as any).numero_attestation}`,
        montant: Number((v as any).montant ?? 0), ref_type: "vente", ref_id: it.refId,
        stagiaire: s, clientNom: `${s?.civilite ?? ""} ${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim(),
      });
    } else {
      if (dejaDossiers.has(it.refId)) throw new Error("Un dossier sélectionné est déjà facturé.");
      const { data: d } = await supabaseAdmin.from("dossiers").select("*, stagiaires:stagiaire_id (*)").eq("id", it.refId).maybeSingle();
      if (!d) throw new Error("Dossier introuvable.");
      const estCpf = (d as any).origine_fonds === "CPF_CDC" || (d as any).financement === "CPF";
      if (estCpf) throw new Error("Un dossier CPF se facture séparément (payeur Caisse des Dépôts) — il ne peut pas être regroupé.");
      const serie = (d as any).financement === "OPCO" ? "OPCO" : (d as any).financement === "PoleEmploi" ? "FT" : "FFP";
      const s = (d as any).stagiaires;
      const intitule = LIBELLE_CERTIF[(d as any).certif] ?? `Formation ${(d as any).certif}`;
      const heures = (d as any).heures_realisees ?? (d as any).heures_prevues;
      const brut = Number((d as any).montant ?? 0);
      const remise = Math.min(Math.max(0, Number((d as any).remise ?? 0)), brut);
      descs.push({
        stagiaireId: (d as any).stagiaire_id, serie, categorie: "formation",
        designation: `${intitule} — ${heures} heures${(d as any).numero_edof ? ` · dossier EDOF ${(d as any).numero_edof}` : ""}`,
        montant: Math.max(0, brut - remise), ref_type: "dossier", ref_id: it.refId,
        stagiaire: s, clientNom: `${s?.civilite ?? ""} ${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim(),
      });
    }
  }

  // Cohérence : même personne, même série.
  const stagiaireId = descs[0].stagiaireId;
  if (descs.some((x) => x.stagiaireId !== stagiaireId)) throw new Error("Tous les produits doivent concerner la même personne.");
  const serie = descs[0].serie;
  if (descs.some((x) => x.serie !== serie)) throw new Error("Produits de séries/payeurs différents : facturez-les séparément (ex. examen et formation ne se regroupent pas).");

  const total = descs.reduce((sum, x) => sum + x.montant, 0);
  const designation = descs.map((x) => `${x.designation} (${x.montant.toLocaleString("fr-FR")} €)`).join(" ; ");
  const client = descs[0].clientNom;
  const reglement = SERIE_REGLEMENT[serie] ?? "Paiement direct";

  const { data: facture, error } = await supabaseAdmin
    .from("factures")
    .insert({ montant: total, designation, client, serie, numero: "ATTRIBUE_PAR_LE_SERVEUR" })
    .select("*").single();
  if (error) throw new Error(error.message);

  const lignes = descs.map((x, i) => ({
    facture_id: (facture as any).id, designation: x.designation, categorie: x.categorie,
    quantite: 1, prix_unitaire: x.montant, montant: x.montant, ref_type: x.ref_type, ref_id: x.ref_id, ordre: i,
  }));
  const { error: eLignes } = await supabaseAdmin.from("facture_lignes").insert(lignes);
  if (eLignes) console.warn("[factures] lignes groupées non écrites:", eLignes.message);

  await journal("factures", (facture as any).id, "facture_groupee_emise",
    { numero: (facture as any).numero, montant: total, serie, items: descs.map((x) => ({ t: x.ref_type, id: x.ref_id })) }, auteur ?? null);

  const pdf = await rendreEtArchiver(facture, adresseClient(descs[0].stagiaire), reglement, false);
  return { id: (facture as any).id, numero: (facture as any).numero, montant: total, client, dejaExistante: false, pdf };
}
export async function marquerPayee(factureId: string, auteur?: string | null): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await chargerFacture(factureId);
  if (!ctx) return { ok: false, erreur: "Facture introuvable." };
  if (ctx.facture.statut === "payée") return { ok: true };

  const { error } = await supabaseAdmin
    .from("factures")
    .update({ statut: "payée", date_paiement: aujourdHuiParisISO(), updated_at: new Date().toISOString() })
    .eq("id", factureId);
  if (error) return { ok: false, erreur: error.message };

  await journal("factures", factureId, "facture_payee", { numero: ctx.facture.numero }, auteur ?? null);
  const maj = { ...ctx.facture, statut: "payée", date_paiement: aujourdHuiParisISO() };
  await rendreEtArchiver(maj, adresseClient(ctx.destinataire), ctx.reglement, ctx.estCpf);
  return { ok: true };
}

/** Email de la facture (émission, ou relance J+7 / J+15). Met à jour le statut pour les relances. */
export async function envoyerFacture(
  factureId: string,
  mode: "emission" | "relance_1" | "relance_2",
  auteur?: string | null,
): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await chargerFacture(factureId);
  if (!ctx) return { ok: false, erreur: "Facture introuvable." };
  const { facture: f, destinataire: dest, reglement, estCpf } = ctx;
  if (!dest?.email) return { ok: false, erreur: "Client sans adresse email." };
  if (mode !== "emission" && f.statut === "payée") return { ok: false, erreur: "Facture déjà payée : pas de relance." };
  if (mode !== "emission" && estCpf) return { ok: false, erreur: "Dossier CPF : le payeur est la CDC, pas de relance au stagiaire." };

  const pdf = await rendreEtArchiver(f, adresseClient(dest), reglement, estCpf);
  const numero = f.numero;

  const sujets: Record<string, string> = {
    emission: `Votre facture MYSTORY — ${numero}`,
    relance_1: `Rappel — facture ${numero} en attente de règlement`,
    relance_2: `Relance — facture ${numero} impayée`,
  };
  const corps =
    mode === "emission"
      ? `<p>Bonjour ${dest.prenom ?? ""},</p>
<p>Veuillez trouver ci-joint votre facture <strong>${numero}</strong> (${f.montant} €).${f.statut === "payée" ? " Elle est <strong>acquittée</strong> — aucune action n'est attendue de votre part." : ""}</p>
<p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
<p>L'équipe MYSTORY</p>`
      : mode === "relance_1"
        ? `<p>Bonjour ${dest.prenom ?? ""},</p>
<p>Sauf erreur de notre part, la facture <strong>${numero}</strong> (${f.montant} €, émise le ${dateFR(f.date_emission)}) reste en attente de règlement.</p>
<p>Merci de procéder au paiement ou de nous contacter au 06 81 43 16 54 si vous avez la moindre question.</p>
<p>L'équipe MYSTORY</p>`
        : `<p>Bonjour ${dest.prenom ?? ""},</p>
<p>Malgré notre précédent rappel, la facture <strong>${numero}</strong> (${f.montant} €, émise le ${dateFR(f.date_emission)}) demeure impayée.</p>
<p>Merci de régulariser rapidement ou de nous contacter au 06 81 43 16 54 pour convenir d'une solution.</p>
<p>L'équipe MYSTORY</p>`;

  const envoi = await envoyerEmail({
    a: dest.email,
    objet: sujets[mode],
    html: gabaritEmail(mode === "emission" ? "Votre facture" : "Rappel de règlement", corps),
    piecesJointes: [{ nom: `Facture_${numero}.pdf`, contenu: pdf }],
    entite: "factures", entiteId: factureId, auteur: auteur ?? null,
  });

  if (envoi.ok && (mode === "relance_1" || mode === "relance_2")) {
    await supabaseAdmin.from("factures").update({ statut: mode, updated_at: new Date().toISOString() }).eq("id", factureId);
    await journal("factures", factureId, `facture_${mode}`, { numero }, auteur ?? null);
  }
  return envoi;
}

/**
 * Relances dues aujourd'hui (Europe/Paris) :
 *  · statut « émise »    et émission ≤ J-7  → relance_1
 *  · statut « relance_1 » et émission ≤ J-15 → relance_2
 * Jamais de relance pour un dossier CPF (payeur = CDC) — filtré à l'exécution.
 */
export async function relancesDues(): Promise<Array<{ factureId: string; numero: string; mode: "relance_1" | "relance_2" }>> {
  const ref = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const jMoins = (n: number) => { const d = new Date(ref); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  // Délais réglables via /reglages (leviers cash).
  const j1 = await getParamNumber("relance_facture_jours_1", 7);
  const j2 = await getParamNumber("relance_facture_jours_2", 15);

  const { data } = await supabaseAdmin
    .from("factures")
    .select("id, numero, statut, date_emission")
    .in("statut", ["émise", "relance_1"]);

  const dues: Array<{ factureId: string; numero: string; mode: "relance_1" | "relance_2" }> = [];
  for (const f of (data ?? []) as any[]) {
    if (f.statut === "émise" && f.date_emission <= jMoins(j1)) dues.push({ factureId: f.id, numero: f.numero, mode: "relance_1" });
    else if (f.statut === "relance_1" && f.date_emission <= jMoins(j2)) dues.push({ factureId: f.id, numero: f.numero, mode: "relance_2" });
  }
  return dues;
}

/**
 * Dossiers FORMATION dus et NON encore facturés, éligibles à la facturation automatique (point 27).
 * Règles (idempotent, sans effet de bord) :
 *  · annulés et déjà facturés (facture directe OU ligne de facture groupée) → exclus ;
 *  · CPF → éligible seulement si `service_fait_valide` (verrou L.6323-12, déjà appliqué par facturerDossier) ;
 *  · non-CPF → exclu si une remise hors CPF est EN ATTENTE de validation Direction
 *    (on ne facture jamais au prix plein avant l'accord — cohérent avec le point 26) ;
 *  · montant nul → ignoré.
 */
export async function facturationAutoDue(): Promise<Array<{
  dossierId: string; certif: string; estCpf: boolean; montantNet: number; client: string;
}>> {
  const [{ data: dossiers }, { data: deja }, { data: lignesRef }, { data: remisesEnAttente }] = await Promise.all([
    supabaseAdmin.from("dossiers").select(
      "id, certif, montant, remise, financement, origine_fonds, service_fait_valide, statut, stagiaires:stagiaire_id (civilite, prenom, nom)"
    ),
    supabaseAdmin.from("factures").select("dossier_id"),
    supabaseAdmin.from("facture_lignes").select("ref_type, ref_id"),
    supabaseAdmin.from("validations_direction").select("payload").eq("type", "remise_hors_cpf").eq("statut", "en_attente"),
  ]);

  const factures = new Set((deja ?? []).map((f: any) => f.dossier_id).filter(Boolean));
  for (const l of lignesRef ?? []) {
    if ((l as any).ref_type === "dossier" && (l as any).ref_id) factures.add((l as any).ref_id);
  }
  const remiseBloquee = new Set(
    (remisesEnAttente ?? []).map((v: any) => v.payload?.dossierId).filter(Boolean)
  );

  const out: Array<{ dossierId: string; certif: string; estCpf: boolean; montantNet: number; client: string }> = [];
  for (const d of dossiers ?? []) {
    const dd: any = d;
    if (dd.statut === "annule") continue;
    if (factures.has(dd.id)) continue;
    const montant = Number(dd.montant ?? 0);
    if (!(montant > 0)) continue;
    const estCpf = dd.origine_fonds === "CPF_CDC" || dd.financement === "CPF";
    if (estCpf) {
      if (!dd.service_fait_valide) continue;       // CPF : pas avant le service fait validé
    } else {
      if (remiseBloquee.has(dd.id)) continue;       // non-CPF : remise en attente → on saute
    }
    const remise = estCpf ? 0 : Math.min(Math.max(0, Number(dd.remise ?? 0)), montant);
    const s = dd.stagiaires;
    out.push({
      dossierId: dd.id,
      certif: dd.certif,
      estCpf,
      montantNet: Math.max(0, montant - remise),
      client: `${s?.civilite ?? ""} ${s?.prenom ?? ""} ${s?.nom ?? ""}`.trim(),
    });
  }
  return out;
}
