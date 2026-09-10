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
import { joursOuvresAvant } from "@/lib/joursOuvres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 10/09/2026 — le delai passe de 7 jours CALENDAIRES a 5 jours OUVRES, et c'est
// desormais le meme seuil pour tout : a J-5 ouvres la convocation part au candidat
// ET les inscriptions se ferment. Un seuil unique, parce que deux seuils
// differents produisent la situation ou un candidat est inscrit apres l'envoi des
// convocations et n'en reçoit jamais.
// ⚠️ L'article 4 de la convention partenaire doit dire la meme chose : il parlait
// de sept jours calendaires. Les deux textes se contrediraient sinon.
const DELAI_OUVRES = 5;
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
    delai_ouvres: DELAI_OUVRES,
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
  // 10/09/2026 — tous les champs que la CCI reclame a l'inscription. Sans eux, il
  // fallait rappeler le candidat pour lui demander sa nationalite ou son numero de
  // piece, donc refaire le travail que le partenaire avait deja fait.
  const civilite = champ("civilite");
  const genre = champ("genre");
  const lieuNaissance = champ("lieu_naissance");
  const langue = champ("langue_maternelle");
  const nationalite = champ("nationalite");
  const adresse = champ("adresse");
  const cp = champ("code_postal");
  const ville = champ("ville");
  const pays = champ("pays") || "France";
  const numPiece = champ("num_piece");
  const sousType = champ("sous_type");
  const piece = form.get("piece") as File | null;

  // Ce que la CCI exige : sans l'un de ces elements, l'inscription est refusee et
  // il faut rappeler le candidat. Autant le bloquer ici.
  const manquants: string[] = [];
  if (!sessionId) manquants.push("la session");
  if (!nom) manquants.push("le nom");
  if (!prenom) manquants.push("le prénom");
  if (!naissance) manquants.push("la date de naissance");
  if (!lieuNaissance) manquants.push("le lieu de naissance");
  if (!nationalite) manquants.push("la nationalité");
  if (!numPiece) manquants.push("le numéro de pièce d'identité");
  if (!sousType) manquants.push("la mention visée");
  if (!email) manquants.push("le courriel");
  if (!telephone) manquants.push("le téléphone");
  // 10/09/2026 — adresse et langue maternelle deviennent obligatoires.
  // L'adresse est exigee avec son code postal et sa ville : « 15 rue des Lilas »
  // sans commune n'est pas une adresse, et c'est nous qui rappelions le candidat
  // pour la completer.
  if (!langue) manquants.push("la langue maternelle");
  if (!adresse) manquants.push("l'adresse");
  if (!cp) manquants.push("le code postal");
  if (!ville) manquants.push("la ville");
  if (manquants.length) {
    return NextResponse.json(
      { ok: false, erreur: `Il manque ${manquants.join(", ")} — la CCI les exige à l'inscription.` },
      { status: 400 });
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

  // Jours OUVRES, pas calendaires : samedis, dimanches et feries ne comptent pas,
  // comme le dit la convention. Le calcul passe par une date construite en local —
  // new Date("2026-09-14") decale d'un jour selon le fuseau et ferait refuser une
  // inscription encore dans les temps.
  const ouvres = joursOuvresAvant(s.date_examen);
  if (ouvres < DELAI_OUVRES) {
    return NextResponse.json(
      { ok: false, erreur: `Les inscriptions ferment ${DELAI_OUVRES} jours ouvrés avant la session, `
                         + `en même temps que l'envoi des convocations. `
                         + `Il ne reste que ${ouvres} jour${ouvres > 1 ? "s" : ""} ouvré`
                         + `${ouvres > 1 ? "s" : ""} avant celle-ci.` }, { status: 409 });
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
      candidat_civilite: civilite || null,
      candidat_genre: genre || null,
      candidat_lieu_naissance: lieuNaissance || null,
      candidat_langue_maternelle: langue || null,
      candidat_nationalite: nationalite || null,
      candidat_adresse: adresse || null,
      candidat_code_postal: cp || null,
      candidat_ville: ville || null,
      candidat_pays: pays,
      candidat_num_piece: numPiece || null,
      sous_type: sousType || null,
      piece_identite_path: chemin,
      piece_identite_nom: piece.name.slice(0, 200),
      piece_identite_depose_le: new Date().toISOString(),
      // 10/09/2026 — AUTO-CONFIRMATION. Le centre ne valide plus chaque
      // inscription une par une : la place etait deja decomptee au depot, et
      // la validation ne faisait que retarder la convocation. Le controle se
      // fait desormais A L'ACCUEIL, par deux cases certifiant la carence/fraude
      // et l'exactitude des informations — une verification tracee, pas une porte.
      statut: "confirmee", auteur: `partenaire:${p.raison_sociale}`,
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

/**
 * PATCH → le partenaire corrige la fiche d'un de SES candidats.
 *
 * 10/09/2026 — jusqu'ici une faute de frappe obligeait a retirer le candidat et a
 * tout resaisir, piece d'identite comprise. Le partenaire appelait, ou pire :
 * laissait l'erreur, et c'est la CCI qui refusait l'inscription le jour J.
 *
 * Trois limites, dans cet ordre :
 *   - ses candidats seulement (partenaire_id) ;
 *   - pas une fiche deja refusee ou retiree, qui ne represente plus rien ;
 *   - PLUS RIEN a moins de 5 jours ouvres : la convocation est partie, et laisser
 *     modifier un nom apres coup produirait une convocation et une piece d'identite
 *     qui ne concordent pas au controle.
 * La session n'est pas modifiable : changer de date, c'est une autre inscription,
 * avec un autre decompte de places.
 */
export async function PATCH(req: NextRequest) {
  const p = await courant(req);
  if (!p) return nonConnecte();

  let b: any;
  try { b = await req.json(); } catch {
    return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 });
  }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const { data: d } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, statut, sessions_examen:session_id (date_examen)")
    .eq("id", id).eq("partenaire_id", p.id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Candidat introuvable." }, { status: 404 });
  if (["refusee", "annulee"].includes(d.statut)) {
    return NextResponse.json(
      { ok: false, erreur: "Cette inscription n'est plus active." }, { status: 409 });
  }

  const s: any = Array.isArray((d as any).sessions_examen)
    ? (d as any).sessions_examen[0] : (d as any).sessions_examen;
  if (s?.date_examen) {
    const ouvres = joursOuvresAvant(s.date_examen);
    if (ouvres < DELAI_OUVRES) {
      return NextResponse.json(
        { ok: false, erreur: `La convocation est déjà partie : la fiche n'est plus modifiable à `
                           + `moins de ${DELAI_OUVRES} jours ouvrés de la session. `
                           + `Appelez le centre au 06 81 43 16 54.` }, { status: 409 });
    }
  }

  // Liste blanche : le partenaire corrige l'identite, rien d'autre.
  const CHAMPS: Record<string, string> = {
    civilite: "candidat_civilite", genre: "candidat_genre",
    nom: "candidat_nom", prenom: "candidat_prenom",
    naissance: "candidat_naissance", lieu_naissance: "candidat_lieu_naissance",
    langue_maternelle: "candidat_langue_maternelle", nationalite: "candidat_nationalite",
    email: "candidat_email", telephone: "candidat_telephone",
    adresse: "candidat_adresse", code_postal: "candidat_code_postal",
    ville: "candidat_ville", pays: "candidat_pays",
    num_piece: "candidat_num_piece", sous_type: "sous_type",
  };

  const maj: Record<string, any> = {};
  for (const [envoye, colonne] of Object.entries(CHAMPS)) {
    if (!(envoye in b)) continue;
    let v = String(b[envoye] ?? "").trim();
    if (envoye === "nom") v = v.toUpperCase();
    if (envoye === "email") v = v.toLowerCase();
    maj[colonne] = v || null;
  }
  if (!Object.keys(maj).length) {
    return NextResponse.json({ ok: false, erreur: "Aucune modification." }, { status: 400 });
  }
  if (maj.candidat_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(maj.candidat_email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (maj.candidat_naissance && !/^\d{4}-\d{2}-\d{2}$/.test(maj.candidat_naissance)) {
    return NextResponse.json(
      { ok: false, erreur: "Date de naissance attendue au format AAAA-MM-JJ." }, { status: 400 });
  }

  // La fiche a change : le controle d'accueil qui portait sur l'ancienne version
  // ne vaut plus. On le remet a zero, sinon l'accueil certifierait des informations
  // qu'il n'a pas vues.
  maj.controle_infos = false;
  maj.controle_carence_fraude = false;
  maj.controle_par = null;
  maj.controle_le = null;
  maj.modifie_le = new Date().toISOString();
  maj.modifie_par = `partenaire:${p.raison_sociale}`;

  const { error } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .update(maj).eq("id", id).eq("partenaire_id", p.id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("demande_partenaire", id, "modification",
    { partenaire: p.raison_sociale, champs: Object.keys(maj).filter((k) => k.startsWith("candidat_") || k === "sous_type") },
    `partenaire:${p.raison_sociale}`);
  return NextResponse.json({ ok: true });
}
