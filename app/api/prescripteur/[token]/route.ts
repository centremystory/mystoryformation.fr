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
import { journal } from "@/lib/examens";
import { resolverPrescripteur, sessionsOuvertes, mesDemandes, jourDe } from "@/lib/prescripteur";

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

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await resolverPrescripteur(params.token);
  if (!p) return invalide();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const sessionId = String(b?.session_id ?? "").trim();
  const nom = String(b?.nom ?? "").trim();
  const prenom = String(b?.prenom ?? "").trim();
  const email = String(b?.email ?? "").trim().toLowerCase();
  const telephone = String(b?.telephone ?? "").trim();
  const naissance = String(b?.naissance ?? "").trim();

  if (!sessionId || !nom || !prenom) {
    return NextResponse.json({ ok: false, erreur: "Session, nom et prénom sont obligatoires." }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (naissance && !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
    return NextResponse.json({ ok: false, erreur: "Date de naissance attendue au format AAAA-MM-JJ." }, { status: 400 });
  }

  // La session doit etre OUVERTE A CE PARTENAIRE. On la relit depuis la liste
  // autorisee plutot que depuis la base : un identifiant devine ne suffit pas.
  const ouvertes = await sessionsOuvertes(p);
  const s = ouvertes.find((x) => x.id === sessionId);
  if (!s) {
    return NextResponse.json(
      { ok: false, erreur: "Cette session n'est pas ouverte à votre organisme." }, { status: 403 });
  }
  if (s.places_restantes <= 0) {
    return NextResponse.json({ ok: false, erreur: "Plus de place disponible sur cette session." }, { status: 409 });
  }

  // Article 4 : depot au plus tard 7 jours calendaires avant la session.
  const jours = Math.floor(
    (new Date(s.date_examen + "T00:00:00Z").getTime() - Date.now()) / 86400000);
  if (jours < DELAI_JOURS) {
    return NextResponse.json(
      { ok: false, erreur: `Les inscriptions ferment ${DELAI_JOURS} jours avant la session. `
                         + `Celle-ci a lieu dans ${Math.max(0, jours)} jour(s).` }, { status: 409 });
  }

  // Meme candidat, meme session : on refuse plutot que de creer un doublon que
  // quelqu'un devra demeler le jour de l'epreuve.
  if (email) {
    const { data: deja } = await supabaseAdmin
      .from("demandes_inscription_partenaire")
      .select("id").eq("partenaire_id", p.id).eq("session_id", sessionId)
      .eq("candidat_email", email).in("statut", ["en_attente", "confirmee"]).maybeSingle();
    if (deja) {
      return NextResponse.json(
        { ok: false, erreur: "Ce candidat est déjà inscrit sur cette session." }, { status: 409 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .insert({
      partenaire_id: p.id, session_id: sessionId,
      candidat_nom: nom.toUpperCase(), candidat_prenom: prenom,
      candidat_email: email || null, candidat_telephone: telephone || null,
      candidat_naissance: naissance || null,
      statut: "en_attente", auteur: `partenaire:${p.raison_sociale}`,
    })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("demande_partenaire", data.id, "depot",
    { partenaire: p.raison_sociale, session: `${s.date_examen} ${s.horaire}`, candidat: `${nom} ${prenom}` },
    `partenaire:${p.raison_sociale}`);

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await resolverPrescripteur(params.token);
  if (!p) return invalide();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  // Bornage explicite au partenaire du jeton : sans le filtre partenaire_id, un
  // identifiant devine permettrait de retirer la demande d'un autre organisme.
  const { data: d } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, statut").eq("id", id).eq("partenaire_id", p.id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Demande introuvable." }, { status: 404 });
  if (d.statut !== "en_attente") {
    return NextResponse.json(
      { ok: false, erreur: "Cette demande a déjà été traitée : contactez le centre." }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .update({ statut: "annulee" }).eq("id", id).eq("partenaire_id", p.id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("demande_partenaire", id, "retrait", { partenaire: p.raison_sociale },
    `partenaire:${p.raison_sociale}`);
  return NextResponse.json({ ok: true });
}
