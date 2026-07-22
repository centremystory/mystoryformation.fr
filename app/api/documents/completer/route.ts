/**
 * MYSTORY — /api/documents/completer  (pièces « à compléter »)
 * Le formulaire CRM fournit les champs de jugement humain ; le serveur fusionne avec la
 * fiche (lieu = Gagny forcé), rend le PDF, l'archive et passe la pièce en « généré ».
 *
 * GET  ?dossier=<uuid>&type=<piece>  → dernière saisie (pré-remplissage du formulaire)
 * POST { dossierId, type, champs, auteur? }
 *
 * Types : fiche_analyse_besoin · evaluation_finale
 * Verrous :
 *  - fiche_analyse_besoin : la cohérence durée/écart de niveau DOIT être vérifiée (case obligatoire) ;
 *    l'objectif principal est nécessairement professionnel (anti-démarchage CPF).
 *  - evaluation_finale : interdite avant la dernière séance (anti-antidate) ; le niveau global
 *    saisi met à jour dossiers.niveau_atteint → l'attestation de fin reprend EXACTEMENT ce niveau
 *    (cohérence des niveaux CECRL, une seule source de vérité).
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate, FicheStagiaire } from "@/lib/mergeEngine";
import { renderHtmlToPdf, createFicheBesoinSubmissionFromHtml } from "@/lib/docuseal";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { getFiche, archiveDocument, setPieceStatus, getSignedUrl } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPLETABLES = new Set(["fiche_analyse_besoin", "evaluation_finale"]);
const NIVEAUX = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
const COCHE = "☑";
const VIDE = "☐";

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function dateFinISO(fiche: FicheStagiaire): string | null {
  const dates = (fiche.planning ?? []).map((s) => s.date).filter(Boolean) as string[];
  if (dates.length > 0) return [...dates].sort().slice(-1)[0];
  return fiche.dateFin ?? null;
}
const box = (on: boolean) => (on ? COCHE : VIDE);

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  const dossier = req.nextUrl.searchParams.get("dossier")?.trim();
  const type = req.nextUrl.searchParams.get("type")?.trim();
  if (!dossier || !type) return NextResponse.json({ ok: false, erreur: "Paramètres requis : dossier et type." }, { status: 400 });
  const { data } = await supabaseAdmin
    .from("completions").select("champs, auteur, horodatage")
    .eq("dossier_id", dossier).eq("piece_type", type).maybeSingle();
  return NextResponse.json({ ok: true, completion: data ?? null });
}

export async function POST(req: NextRequest) {
  let u: SessionUser;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossierId ?? "").trim();
  const type = String(body?.type ?? "").trim();
  const champs = body?.champs ?? {};
  const auteur = u.email ?? (String(body?.auteur ?? "").trim() || null);

  if (!dossierId || !COMPLETABLES.has(type)) {
    return NextResponse.json({ ok: false, erreur: "dossierId et type (fiche_analyse_besoin | evaluation_finale) requis." }, { status: 400 });
  }

  // Restriction : l'évaluation finale (niveau atteint) est réservée Pédagogie / Formatrice / Direction.
  if (type === "evaluation_finale" && u.role && !peut(u.roles ?? u.role, "evaluation_finale")) {
    return NextResponse.json({ ok: false, erreur: "Évaluation finale réservée à la Pédagogie, aux Formatrices et à la Direction." }, { status: 403 });
  }

  let fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const recap: string[] = [];
  let envoyerSignatureFiche = false;
  let extras: Record<string, string | null> = { auteur_completion: auteur };
  let champsValides: Record<string, unknown> = {};

  if (type === "fiche_analyse_besoin") {
    // Objectif principal (v2 : administratif + pro au même niveau ; niveaux mini réglementaires 2026).
    const OBJECTIFS = ["carte_sejour", "carte_resident", "naturalisation", "francais_pro", "emploi_mobilite", "autre"];
    const objectif = String(champs.objectif ?? "");
    const objectifAutre = String(champs.objectif_autre ?? "").trim();
    const projet = String(champs.projet ?? "").trim();
    const compensation = String(champs.compensation ?? "non");
    const compDetail = String(champs.compensation_detail ?? "").trim();
    const coherence = champs.coherence === true;
    const envoyerSignature = champs.envoyer_signature === true;

    const SITE_OPTS = ["gagny", "sarcelles", "rosny"];
    const site = String(champs.site ?? "");

    // Disponibilités en cases — rythme obligatoire ; créneaux + début souhaité facultatifs.
    const DISPO_RYTHMES = ["1", "2", "3", "4", "5", "6"];
    const dispoRythme = String(champs.dispo_rythme ?? "");
    const CRENEAUX = ["matin", "apresmidi", "soir", "samedi"];
    const dispoCreneaux = Array.isArray(champs.dispo_creneaux)
      ? champs.dispo_creneaux.map((x: unknown) => String(x)).filter((x: string) => CRENEAUX.includes(x)) : [];
    const debutSouhaite = String(champs.debut_souhaite ?? "").trim();

    // Statut du bénéficiaire — obligatoire.
    const situation = String(champs.situation ?? "");
    const situationDetail = String(champs.situation_detail ?? "").trim();

    // Financement (+ information reste à charge CPF). Garde-fou CPF = rappel non bloquant (UI).
    const FINANCEMENTS = ["cpf", "opco", "personnel"];
    const financement = String(champs.financement ?? "");
    const cpfInforme = champs.cpf_informe === true;

    // Positionnement (Qualiopi ind. 8) — obligatoire.
    const positionnement = String(champs.positionnement ?? "");
    const positionnementDetail = String(champs.positionnement_detail ?? "").trim();
    const positionnementDate = String(champs.positionnement_date ?? "").trim();
    const positionnementResultat = String(champs.positionnement_resultat ?? "").trim();

    // Certification visée + examen prévu + justification de durée.
    const certification = String(champs.certification ?? "");
    const examenPrevu = String(champs.examen_prevu ?? "").trim();
    const dureeJustification = String(champs.duree_justification ?? "").trim();
    const commentaires = String(champs.commentaires ?? "").trim();

    if (!OBJECTIFS.includes(objectif)) recap.push("Objectif principal à choisir.");
    if (objectif === "autre" && !objectifAutre) recap.push("Objectif « Autre » : précision obligatoire.");
    if (!projet) recap.push("Projet du bénéficiaire (avec ses mots) et échéance à renseigner.");
    if (!SITE_OPTS.includes(site)) recap.push("Site à indiquer (Gagny / Sarcelles / Rosny).");
    if (!["salarie", "demandeur_emploi", "chef_entreprise", "autre"].includes(situation))
      recap.push("Statut du bénéficiaire à renseigner.");
    if (situation === "autre" && !situationDetail) recap.push("Statut « Autre » : précision obligatoire.");
    if (!FINANCEMENTS.includes(financement)) recap.push("Financement à indiquer (CPF / OPCO / Personnel).");
    if (!["test", "attestation", "autre"].includes(positionnement))
      recap.push("Méthode de positionnement à renseigner (test / attestation / autre).");
    if (positionnement === "autre" && !positionnementDetail) recap.push("Positionnement « Autre » : précision obligatoire.");
    if (!DISPO_RYTHMES.includes(dispoRythme)) recap.push("Rythme de disponibilité à indiquer (1 à 6 fois / semaine).");
    if (compensation === "oui" && !compDetail) recap.push("Situation de handicap « Oui » : préciser et orienter vers le référent handicap.");
    if (!coherence) recap.push("La cohérence (niveau visé > niveau actuel, cohérent avec l'objectif) doit être vérifiée et cochée.");
    if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

    extras = {
      ...extras,
      // Objectif principal (v2)
      obj_sejour: box(objectif === "carte_sejour"),
      obj_resident: box(objectif === "carte_resident"),
      obj_naturalisation: box(objectif === "naturalisation"),
      obj_pro: box(objectif === "francais_pro"),
      obj_emploi: box(objectif === "emploi_mobilite"),
      obj_autre: box(objectif === "autre"),
      objectif_autre: objectif === "autre" ? objectifAutre : null,
      projet,
      // Site
      site_gagny: box(site === "gagny"),
      site_sarcelles: box(site === "sarcelles"),
      site_rosny: box(site === "rosny"),
      // Statut
      sit_salarie: box(situation === "salarie"),
      sit_de: box(situation === "demandeur_emploi"),
      sit_chef: box(situation === "chef_entreprise"),
      sit_autre: box(situation === "autre"),
      situation_detail: situation === "autre" ? situationDetail : null,
      // Financement
      fin_cpf: box(financement === "cpf"),
      fin_opco: box(financement === "opco"),
      fin_perso: box(financement === "personnel"),
      cpf_informe: box(financement === "cpf" && cpfInforme),
      // Positionnement
      pos_test: box(positionnement === "test"),
      pos_attest: box(positionnement === "attestation"),
      pos_autre: box(positionnement === "autre"),
      positionnement_detail: positionnement === "autre" ? positionnementDetail : null,
      positionnement_date: positionnementDate || null,
      positionnement_resultat: positionnementResultat || null,
      // Certification visée
      cert_tef: box(certification === "tef_irn" || (!certification && fiche.certif === "TEF_IRN")),
      cert_leveltel: box(certification === "leveltel" || (!certification && fiche.certif === "LEVELTEL")),
      examen_prevu: examenPrevu || null,
      duree_justification: dureeJustification || null,
      // Disponibilités
      dispo_1: box(dispoRythme === "1"), dispo_2: box(dispoRythme === "2"), dispo_3: box(dispoRythme === "3"),
      dispo_4: box(dispoRythme === "4"), dispo_5: box(dispoRythme === "5"), dispo_6: box(dispoRythme === "6"),
      dispo_matin: box(dispoCreneaux.includes("matin")),
      dispo_aprem: box(dispoCreneaux.includes("apresmidi")),
      dispo_soir: box(dispoCreneaux.includes("soir")),
      dispo_samedi: box(dispoCreneaux.includes("samedi")),
      debut_souhaite: debutSouhaite || null,
      commentaires: commentaires || null,
      // Handicap
      comp_non: box(compensation !== "oui"),
      comp_oui: box(compensation === "oui"),
      compensation_detail: compensation === "oui" ? compDetail : null,
      // Niveau actuel estimé (Infra-A1 = A0 en base)
      est_infra: box(fiche.niveauInitial === "A0"),
      est_a1: box(fiche.niveauInitial === "A1"),
      est_a2: box(fiche.niveauInitial === "A2"),
      est_b1: box(fiche.niveauInitial === "B1"),
      est_b2: box(fiche.niveauInitial === "B2"),
      est_c1: box(fiche.niveauInitial === "C1"),
      // Niveau visé
      vise_a2: box(fiche.niveauVise === "A2"),
      vise_b1: box(fiche.niveauVise === "B1"),
      vise_b2: box(fiche.niveauVise === "B2"),
      vise_c1: box(fiche.niveauVise === "C1"),
    };
    champsValides = {
      objectif, objectif_autre: objectifAutre, projet, site,
      situation, situation_detail: situationDetail,
      financement, cpf_informe: cpfInforme,
      positionnement, positionnement_detail: positionnementDetail,
      positionnement_date: positionnementDate, positionnement_resultat: positionnementResultat,
      certification, examen_prevu: examenPrevu, duree_justification: dureeJustification,
      dispo_rythme: dispoRythme, dispo_creneaux: dispoCreneaux, debut_souhaite: debutSouhaite,
      commentaires, compensation, compensation_detail: compDetail, coherence,
    };
    envoyerSignatureFiche = envoyerSignature;
  }

  if (type === "evaluation_finale") {
    // Anti-antidate : pas d'évaluation finale avant la dernière séance.
    const fin = dateFinISO(fiche);
    if (!fin) recap.push("Date de fin introuvable (aucune séance au planning).");
    else if (fin > aujourdHuiParisISO())
      recap.push(`La formation se termine le ${fin} : impossible de réaliser l'évaluation finale avant cette date (anti-antidate).`);

    const niveaux: Record<string, string> = {};
    for (const c of ["co", "ce", "eo", "ee"]) {
      const v = String(champs[`niveau_${c}`] ?? "");
      if (!NIVEAUX.includes(v)) recap.push(`Niveau ${c.toUpperCase()} à renseigner (A0 → C2).`);
      niveaux[c] = v;
    }
    const global = String(champs.niveau_global ?? "");
    if (!NIVEAUX.includes(global)) recap.push("Niveau global atteint à renseigner (A0 → C2).");
    const commentaires = String(champs.commentaires ?? "").trim();
    const axes = String(champs.axes ?? "").trim();
    if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

    // Cohérence des niveaux : le niveau global saisi devient LE niveau du dossier
    // (l'attestation de fin le reprend tel quel — une seule source de vérité).
    const { error: majErr } = await supabaseAdmin
      .from("dossiers").update({ niveau_atteint: global }).eq("id", dossierId);
    if (majErr) return NextResponse.json({ ok: false, erreur: majErr.message }, { status: 500 });
    fiche = (await getFiche(dossierId))!; // fiche fraîche → objectifs_atteints calculés sur le bon niveau

    for (const c of ["co", "ce", "eo", "ee"]) {
      for (const lvl of NIVEAUX) {
        extras[`g_${c}_${lvl.toLowerCase()}`] = box(niveaux[c] === lvl);
      }
    }
    extras.niveau_global = global;
    extras.commentaires = commentaires; // chaîne vide acceptée (rendu blanc, jamais « À COMPLÉTER »)
    extras.axes = axes;
    champsValides = { ...Object.fromEntries(Object.entries(niveaux).map(([k, v]) => [`niveau_${k}`, v])), niveau_global: global, commentaires, axes };
  }

  // Trace de la saisie (horodatage serveur, upsert : la dernière complétion fait foi)
  const { error: compErr } = await supabaseAdmin
    .from("completions")
    .upsert({ dossier_id: dossierId, piece_type: type, champs: champsValides, auteur }, { onConflict: "dossier_id,piece_type" });
  if (compErr) return NextResponse.json({ ok: false, erreur: compErr.message }, { status: 500 });

  const merge = mergeTemplate(type, fiche, extras);
  if (merge.missing.length > 0) {
    return NextResponse.json(
      { ok: false, status: "champs_manquants", recap: merge.missing.map((m) => `Champ requis manquant : ${m}`) },
      { status: 409 },
    );
  }

  try {
    await renderHtmlToPdf({ html: merge.html, name: `${type} — ${fiche.prenom} ${fiche.nom}` }).then(async ({ pdf }) => {
      await archiveDocument({ dossierId, piece: type, variant: "genere", pdf, generatedAt: new Date().toISOString() });
      await setPieceStatus({ dossierId, piece: type, status: "genere", at: new Date().toISOString() });
    });
    const pdfUrl = await getSignedUrl(`${dossierId}/${type}_genere.pdf`, 3600);

    if (type === "fiche_analyse_besoin" && envoyerSignatureFiche) {
      const sigStagiaire = `<signature-field name="Signature bénéficiaire" role="Stagiaire" required="true" style="width:200px;height:46px;display:inline-block;"></signature-field>`;
      const sigCentre = `<signature-field name="Signature centre" role="Centre" required="true" style="width:200px;height:46px;display:inline-block;"></signature-field>`;
      const htmlSign = merge.html.replace("<!--SIG_STAGIAIRE-->", sigStagiaire).replace("<!--SIG_CENTRE-->", sigCentre);
      const centreEmail = process.env.DOCUSEAL_OF_EMAIL ?? "contact@mystoryformation.fr";
      try {
        const sub = await createFicheBesoinSubmissionFromHtml({
          html: htmlSign,
          stagiaire: { prenom: fiche.prenom ?? "", nom: fiche.nom ?? "", email: fiche.email ?? "" },
          centreEmail, dossierId, sendEmail: true,
        });
        await setPieceStatus({ dossierId, piece: type, status: "envoye_a_signer", at: new Date().toISOString() });
        await journal("dossier", dossierId, "fiche_besoin_envoyee_signature", { submission_id: sub.submissionId }, auteur);
        return NextResponse.json({ ok: true, dossierId, type, status: "envoye_a_signer", pdfUrl, signUrl: sub.signUrl ?? null });
      } catch (e) {
        return NextResponse.json({ ok: false, status: "erreur_signature", erreur: `Fiche générée mais envoi à signer impossible : ${String(e)}`, pdfUrl }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true, dossierId, type, status: "genere", pdfUrl });
  } catch (e) {
    await setPieceStatus({ dossierId, piece: type, status: "erreur_envoi", at: new Date().toISOString() });
    return NextResponse.json({ ok: false, status: "erreur", erreur: String(e) }, { status: 502 });
  }
}

