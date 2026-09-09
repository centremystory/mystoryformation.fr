/**
 * MYSTORY — Portail prescripteur : lecture et depot de demandes d'inscription.
 *
 * GET    → les creneaux ouverts a ce partenaire + ses demandes deja deposees.
 * POST   → depose une demande pour un candidat.
 * DELETE → retire une demande encore en attente (le partenaire s'est trompe).
 *
 * Le jeton tient lieu d'authentification : aucune route n'accepte d'identifiant de
 * partenaire venant du corps de la requete. Tout est borne au partenaire que le
 * jeton resout, sinon un partenaire pourrait inscrire au nom d'un autre.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverPrescripteur, sessionsOuvertes, mesDemandes } from "@/lib/prescripteur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delai de depot : l'article 4 de la convention impose 7 jours calendaires avant la
// session. Le faire respecter par le code evite d'avoir a le refuser a la main.
const DELAI_JOURS = 7;

function invalide() {
  return NextResponse.json({ ok: false, erreur: "Lien invalide ou expiré." }, { status: 404 });
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const p = await resolverPrescripteur(params.token);
  if (!p) return invalide();

  const [sessions, demandes] = await Promise.all([sessionsOuvertes(p), mesDemandes(p)]);

  // Trace de passage, sans bloquer la reponse si l'ecriture echoue.
  supabaseAdmin.from("partenaires")
    .update({ derniere_visite: new Date().toISOString() }).eq("id", p.id)
    .then(undefined, () => { /* le suivi de visite ne doit jamais casser le portail */ });

  return NextResponse.json({
    ok: true,
    partenaire: {
      raison_sociale: p.raison_sociale,
      contact_nom: p.contact_nom,
      centre: p.centre,
      plafond_places: p.plafond_places,
      tarif_tef_irn: p.tarif_tef_irn,
      tarif_civique: p.tarif_civique,
      jours_autorises: p.jours_autorises,
    },
    delai_jours: DELAI_JOURS,
    sessions, demandes,
  });
}

// 10/09/2026 — POST et DELETE RETIRES de cette route.
//
// Le portail est passe a une authentification par adresse et mot de passe. Laisser
// le jeton d'URL ecrire aurait vide la mesure de son sens : un ancien lien, colle
// dans une conversation ou reste dans l'historique d'un poste partage, aurait
// permis d'inscrire des candidats sans mot de passe — et sans joindre la piece
// d'identite desormais obligatoire.
//
// Le jeton ne sert donc plus qu'a UNE chose : verifier, au premier acces, qu'il
// correspond bien a un partenaire, avant de l'envoyer poser son mot de passe.
// Les ecritures passent par /api/prescripteur/portail, qui exige la session.
