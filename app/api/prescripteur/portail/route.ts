/**
 * MYSTORY — Portail prescripteur, version authentifiee par session.
 *
 * Remplace /api/prescripteur/[token] pour l'usage courant : le jeton d'URL ne sert
 * plus qu'au PREMIER acces, le temps que le partenaire pose son mot de passe.
 *
 * GET    → creneaux ouverts + candidats deposes.
 * POST   → depose une demande (multipart : la piece d'identite arrive avec).
 * DELETE → retire une demande encore en attente.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { sessionPrescripteur } from "@/lib/prescripteurAuth";
import { resolverPrescripteurParId, sessionsOuvertes, mesDemandes } from "@/lib/prescripteur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELAI_JOURS = 7;                       // article 4 de la convention
const BUCKET = "documents";
const TAILLE_MAX = 8 * 1024 * 1024;          // 8 Mo : une photo de piece d'identite
const TYPES_OK = ["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"];

async function courant(req: NextRequest) {
  const s = await sessionPrescripteur(req);
  if (!s) return null;
  return resolverPrescripteurParId(s.id);
}

function nonConnecte() {
  return NextResponse.json({ ok: false, erreur: "Session expirée." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const p = await courant(req);
  if (!p) return nonConnecte();
  const [sessions, demandes] = await Promise.all([sessionsOuvertes(p), mesDemandes(p)]);
  return NextResponse.json({
    ok: true,
    partenaire: {
      raison_sociale: p.raison_sociale, contact_nom: p.contact_nom, centre: p.centre,
      plafond_places: p.plafond_places, tarif_tef_irn: p.tarif_tef_irn,
      tarif_civique: p.tarif_civique, jours_autorises: p.jours_autorises,
    },
    delai_jours: DELAI_JOURS,
    sessions, demandes,
  });
}

export async function POST(req: NextRequest) {
  const p = await courant(req);
  if (!p) return nonConnecte();

  // La piece d'identite arrive avec le formulaire : on lit du multipart, pas du JSON.
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ ok: false, erreur: "Formulaire illisible." }, { status: 400 });
  }
  const champ = (n: string) => String(form.get(n) ?? "").trim();

  const sessionId = champ("session_id");
  const nom = champ("nom");
  const prenom = champ("prenom");
  const email = champ("email").toLowerCase();
  const telephone = champ("telephone");
  const naissance = champ("naissance");
  const piece = form.get("piece") as File | null;

  if (!sessionId || !nom || !prenom) {
    return NextResponse.json({ ok: false, erreur: "Session, nom et prénom sont obligatoires." }, { status: 400 });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (naissance && !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
    return NextResponse.json({ ok: false, erreur: "Date de naissance attendue au format AAAA-MM-JJ." }, { status: 400 });
  }

  // La piece d'identite est OBLIGATOIRE : l'article 5.1 met la verification a notre
  // charge, et c'est nous qui repondons devant le certificateur. Sans piece, on ne
  // peut pas preparer le controle du jour J.
  if (!piece || piece.size === 0) {
    return NextResponse.json(
      { ok: false, erreur: "La pièce d'identité du candidat est obligatoire." }, { status: 400 });
  }
  if (piece.size > TAILLE_MAX) {
    return NextResponse.json(
      { ok: false, erreur: "Fichier trop lourd (8 Mo maximum)." }, { status: 400 });
  }
  if (!TYPES_OK.includes(piece.type)) {
    return NextResponse.json(
      { ok: false, erreur: "Formats acceptés : photo (JPEG, PNG, HEIC, WebP) ou PDF." }, { status: 400 });
  }

  const ouvertes = await sessionsOuvertes(p);
  const s = ouvertes.find((x) => x.id === sessionId);
  if (!s) {
    return NextResponse.json(
      { ok: false, erreur: "Cette session n'est pas ouverte à votre organisme." }, { status: 403 });
  }
  if (s.places_restantes <= 0) {
    return NextResponse.json({ ok: false, erreur: "Plus de place sur cette session." }, { status: 409 });
  }

  const jours = Math.floor(
    (new Date(s.date_examen + "T00:00:00Z").getTime() - Date.now()) / 86400000);
  if (jours < DELAI_JOURS) {
    return NextResponse.json(
      { ok: false, erreur: `Les inscriptions ferment ${DELAI_JOURS} jours avant la session. `
                         + `Celle-ci a lieu dans ${Math.max(0, jours)} jour(s).` }, { status: 409 });
  }

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

  // Depot du fichier AVANT l'insertion : une demande sans piece serait a reprendre
  // a la main, alors qu'un fichier orphelin ne gene personne.
  const ext = (piece.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 5);
  const chemin = `partenaires/${p.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: eUp } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(chemin, Buffer.from(await piece.arrayBuffer()), {
      contentType: piece.type, upsert: false,
    });
  if (eUp) {
    return NextResponse.json(
      { ok: false, erreur: `Dépôt de la pièce impossible : ${eUp.message}` }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .insert({
      partenaire_id: p.id, session_id: sessionId,
      candidat_nom: nom.toUpperCase(), candidat_prenom: prenom,
      candidat_email: email || null, candidat_telephone: telephone || null,
      candidat_naissance: naissance || null,
      piece_identite_path: chemin,
      piece_identite_nom: piece.name.slice(0, 200),
      piece_identite_depose_le: new Date().toISOString(),
      statut: "en_attente", auteur: `partenaire:${p.raison_sociale}`,
    })
    .select("id").single();
  if (error) {
    // L'insertion a echoue : on retire le fichier plutot que de le laisser trainer.
    await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  await journal("demande_partenaire", data.id, "depot",
    { partenaire: p.raison_sociale, session: `${s.date_examen} ${s.horaire}`,
      candidat: `${nom} ${prenom}`, piece: true },
    `partenaire:${p.raison_sociale}`);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const p = await courant(req);
  if (!p) return nonConnecte();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

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
