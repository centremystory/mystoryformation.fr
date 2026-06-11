// app/api/inscriptions/route.ts — Création d'une inscription formation
// Revalidation serveur complète (jamais confiance au navigateur), puis RPC atomique.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CATALOGUE, CRENEAUX, CodeFormule, Creneau,
  validerInscription, validerPlanning,
} from "@/lib/inscriptions/regles";

// ⚠️ Même garde que le reste du CRM : à remplacer par la vraie vérification de session.
const AUTH_BACKEND_WIRED = false;
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

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });

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
  if (erreurs.length > 0)
    return NextResponse.json({ ok: false, erreurs }, { status: 422 });

  const f = CATALOGUE[inscription.formule as CodeFormule];

  // 2) Anti-doublon simple : même email + même certif avec dossier non annulé
  const { data: doublon } = await supabase
    .from("stagiaires")
    .select("id, dossiers!inner(id, certif, statut)")
    .eq("email", String(inscription.email).toLowerCase().trim())
    .eq("dossiers.certif", inscription.certification === "TEF_IRN" ? "TEF_IRN" : "LEVELTEL")
    .neq("dossiers.statut", "annule")
    .limit(1);
  if (doublon && doublon.length > 0)
    return NextResponse.json({
      ok: false,
      erreurs: [`Un dossier ${inscription.certification} actif existe déjà pour ${inscription.email}. Vérifier avant de créer un doublon.`],
    }, { status: 409 });

  // 3) Création atomique via RPC
  const { data, error } = await supabase.rpc("creer_inscription_formation", {
    p_stagiaire: {
      civilite: stagiaire.civilite ?? null,
      nom: inscription.nom, prenom: inscription.prenom,
      email: inscription.email, telephone: inscription.telephone,
      adresse: stagiaire.adresse ?? null, cp: stagiaire.cp ?? null, ville: stagiaire.ville ?? null,
      agence: inscription.agenceInscription === "SARCELLES" ? "Sarcelles" : "Gagny",
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
      statut: "incomplet",
    },
    p_seances: seances.map((s: any) => ({
      date_seance: s.date,
      demi_journee: dbDemiJournee(s),
      heures: CRENEAUX[s.creneau as Creneau].heures,
    })),
  });

  if (error) {
    const msg = error.message?.includes("NON_CONFORME")
      ? error.message
      : "Erreur lors de la création. Aucune donnée n'a été enregistrée (transaction annulée).";
    return NextResponse.json({ ok: false, erreurs: [msg] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data }, { status: 201 });
}
