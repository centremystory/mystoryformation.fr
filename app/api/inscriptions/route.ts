// app/api/inscriptions/route.ts — Création d'une inscription formation
// Revalidation serveur complète (jamais confiance au navigateur), puis RPC atomique.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CATALOGUE, CRENEAUX, CodeFormule, Creneau,
  validerInscription, validerPlanning,
} from "@/lib/inscriptions/regles";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

// ⚠️ Même garde que le reste du CRM : à remplacer par la vraie vérification de session.
const AUTH_BACKEND_WIRED = true;
function authOk(_req: NextRequest): boolean { return AUTH_BACKEND_WIRED; }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Mapping créneau → valeurs DB (table planning, CHECK: matin | apres_midi)
// Les séances finales ont lieu PENDANT un créneau normal : demi_journee = celle du créneau,
// la durée (1h/2h) fait foi pour l'émargement (horaires réels dans HORAIRES_FINALES).
function dbDemiJournee(s: { creneau: Creneau; demiJournee?: "MATIN" | "APRES_MIDI" }): string {
  if (s.creneau === "MATIN") return "matin";
  if (s.creneau === "APRES_MIDI") return "apres_midi";
  return s.demiJournee === "APRES_MIDI" ? "apres_midi" : "matin";
}

/** Liste des formatrices éligibles pour le formulaire (actives + justificatif FLE). */
export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  const { data, error } = await supabase
    .from("formatrices")
    .select("id, nom, prenom")
    .eq("actif", true)
    .eq("justificatif_fle", true)
    .order("nom");
  if (error) return NextResponse.json({ formatrices: [] }, { status: 200 });
  return NextResponse.json({ formatrices: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ erreur: "JSON invalide" }, { status: 400 }); }

  const { stagiaire, inscription, seances } = body ?? {};
  if (!stagiaire || !inscription || !Array.isArray(seances))
    return NextResponse.json({ erreur: "Corps incomplet (stagiaire, inscription, seances)" }, { status: 400 });

  // 1) Revalidation métier côté serveur
  const v1 = validerInscription(inscription);
  const v2 = validerPlanning(
    inscription.formule as CodeFormule,
    seances,
    inscription.financement === "CPF" ? inscription.dateCommandeValidee : null
  );
  const erreurs = [...v1.erreurs, ...v2.erreurs];
  if (!inscription.formatriceId)
    erreurs.push("Formatrice référente obligatoire (justificatif FLE requis au dossier).");
  if (erreurs.length > 0)
    return NextResponse.json({ ok: false, erreurs }, { status: 422 });

  const f = CATALOGUE[inscription.formule as CodeFormule];

  // Remise hors CPF (montant en €). Bloquée sur CPF, plafonnée au montant de la formation.
  const remiseBrute = Number(inscription.remise ?? 0);
  const remise = Number.isFinite(remiseBrute) && remiseBrute > 0 ? Math.round(remiseBrute * 100) / 100 : 0;
  const remiseMotif = String(inscription.remiseMotif ?? "").trim() || null;
  if (remise > 0 && inscription.financement === "CPF")
    return NextResponse.json({ ok: false, erreurs: ["Remise impossible sur un financement CPF."] }, { status: 422 });
  if (remise > f.prixEuros)
    return NextResponse.json({ ok: false, erreurs: ["La remise ne peut pas dépasser le montant de la formation."] }, { status: 422 });

  // 2) Anti-doublon : même email + même certif avec dossier non annulé.
  //    Au lieu de bloquer sèchement, on AVERTIT (détails du dossier existant) et on exige
  //    une confirmation explicite (`confirmerDoublon`) pour créer le 2ᵉ en connaissance de cause.
  const confirmerDoublon = inscription.confirmerDoublon === true;
  const { data: doublon } = await supabase
    .from("stagiaires")
    .select("prenom, nom, dossiers!inner(id, certif, statut, created_at)")
    .eq("email", String(inscription.email).toLowerCase().trim())
    .eq("dossiers.certif", inscription.certification === "TEF_IRN" ? "TEF_IRN" : "LEVELTEL")
    .neq("dossiers.statut", "annule")
    .limit(1);

  if (doublon && doublon.length > 0 && !confirmerDoublon) {
    const s0: any = doublon[0];
    const d0: any = Array.isArray(s0.dossiers) ? s0.dossiers[0] : s0.dossiers;
    return NextResponse.json({
      ok: false,
      doublon: true,
      message: `Un dossier ${inscription.certification} actif existe déjà pour ${inscription.email}. Vérifie qu'il ne s'agit pas d'un doublon avant de créer un second dossier.`,
      existant: {
        nom: `${s0.prenom ?? ""} ${s0.nom ?? ""}`.trim(),
        certif: d0?.certif ?? null,
        statut: d0?.statut ?? null,
        cree_le: d0?.created_at ?? null,
      },
    }, { status: 409 });
  }

  // 3) Création atomique via RPC
  // Déclenchement auto de la contractualisation (webhook Supabase → n8n → DocuSeal).
  // Le formulaire l'active par défaut ; l'équipe peut décocher pour différer.
  const declencher = inscription.declencherContractualisation === true;

  const { data, error } = await supabase.rpc("creer_inscription_formation", {
    p_stagiaire: {
      civilite: stagiaire.civilite ?? null,
      nom: inscription.nom, prenom: inscription.prenom,
      email: inscription.email, telephone: inscription.telephone,
      adresse: stagiaire.adresse ?? null, cp: stagiaire.cp ?? null, ville: stagiaire.ville ?? null,
      agence: inscription.agenceInscription === "SARCELLES" ? "Sarcelles" : inscription.agenceInscription === "ROSNY" ? "Rosny" : "Gagny",
      date_naissance: stagiaire.dateNaissance || null,
      ville_naissance: stagiaire.villeNaissance || null,
    },
    p_dossier: {
      certif: inscription.certification,
      financement: inscription.financement,
      montant: f.prixEuros,
      reste_a_charge_accepte: inscription.resteAChargeAccepte ?? false,
      numero_edof: inscription.numeroEdof ?? null,
      niveau_vise: inscription.niveauVise,
      heures_prevues: f.dureeHeures,
      date_validation_commande: inscription.dateCommandeValidee ?? null,
      formatrice_id: inscription.formatriceId,
      statut: "incomplet",
    },
    p_seances: seances.map((s: any) => ({
      date_seance: s.date,
      demi_journee: dbDemiJournee(s),
      heures: CRENEAUX[s.creneau as Creneau].heures,
    })),
    p_declencher: declencher,
  });

  if (error) {
    const msg = error.message?.includes("NON_CONFORME")
      ? error.message
      : "Erreur lors de la création. Aucune donnée n'a été enregistrée (transaction annulée).";
    return NextResponse.json({ ok: false, erreurs: [msg] }, { status: 500 });
  }

  const dossierId = (data as any)?.dossier_id ?? (data as any)?.id ?? null;

  // Remise (hors CPF) reportée sur le dossier — base déjà posée (dossiers.remise / remise_motif).
  if (dossierId && remise > 0) {
    const { error: eRemise } = await supabase.from("dossiers").update({ remise, remise_motif: remiseMotif }).eq("id", dossierId);
    if (eRemise) console.warn("[inscriptions] remise non enregistrée:", eRemise.message);
  }

  await journal("dossier", dossierId, "inscription_creee", {
    certif: inscription.certification, financement: inscription.financement,
    formule: inscription.formule, agence: inscription.agenceInscription,
    remise: remise > 0 ? remise : null, remise_motif: remise > 0 ? remiseMotif : null,
  }, u.email ?? null);

  // Traçabilité : un 2ᵉ dossier a été créé sciemment malgré un dossier actif existant.
  if (confirmerDoublon && doublon && doublon.length > 0) {
    await journal("dossier", dossierId, "doublon_confirme",
      { email: inscription.email, certif: inscription.certification }, u.email ?? null);
  }

  // Onboarding stagiaire (best-effort : n'empêche jamais l'inscription).
  if (inscription.email) {
    const certifLabel = inscription.certification === "TEF_IRN" ? "TEF IRN" : "LEVELTEL";
    const prenom = String(inscription.prenom ?? "").replace(/</g, "&lt;");
    try {
      await envoyerEmail({
        a: inscription.email,
        objet: "Bienvenue chez MYSTORY — votre formation",
        html: gabaritEmail("Bienvenue !", `
          <p>Bonjour ${prenom},</p>
          <p>Votre inscription à la formation préparant la certification <strong>${certifLabel}</strong> est bien enregistrée. Bienvenue chez MYSTORY !</p>
          <p><strong>Lieu de formation</strong><br>MYSTORY — 3 bis avenue de Gagny, 93220 Gagny</p>
          <p><strong>Horaires (entrée et sortie libres)</strong><br>Matin : 9h30–12h30 · Après-midi : 14h–17h<br>Vous signez la feuille de présence à chaque venue.</p>
          <p><strong>Les prochaines étapes</strong></p>
          <ul>
            <li>Vous allez recevoir votre <strong>convention</strong> à signer électroniquement (email séparé).</li>
            <li>Puis votre <strong>convocation</strong> et votre <strong>évaluation initiale</strong> de niveau.</li>
          </ul>
          <p>Une question ? Écrivez-nous à contact@mystoryformation.fr ou au 06 81 43 16 54.</p>
          <p>À très bientôt,<br>L'équipe MYSTORY Formation</p>`),
        entite: "dossier", entiteId: (data as any)?.dossier_id ?? null, auteur: "onboarding-auto",
      });
    } catch (e) { console.warn("[inscriptions] onboarding ignoré:", String(e)); }
  }

  return NextResponse.json({ ok: true, ...data }, { status: 201 });
}
