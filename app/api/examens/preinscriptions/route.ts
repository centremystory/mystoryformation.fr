/**
 * MYSTORY — /api/examens/preinscriptions  (pré-inscription par téléphone)
 * Une personne se pré-inscrit (au tél) → on saisit son identité + l'examen + un LIEN DE PAIEMENT
 * Qonto (collé), et le CRM lui envoie automatiquement le mail de pré-inscription avec ce lien.
 * Suivi : en_attente → convertie (payé : crée la vraie inscription) / expiree / annulee.
 * GET    ?statut=         → liste (+ sessions pour le formulaire).
 * POST   { candidat..., type_examen, sous_type, session_id, montant, lien_paiement, agence }
 *        → crée la pré-inscription + envoie le mail avec le lien.
 * PATCH  { id, action:"convertir"|"annuler"|"renvoyer", carence_forcer?, carence_motif? }
 *        → convertir = paiement constaté : crée la vente (attestation + convocation + facture).
 * Pas de suppression (statut). Tout journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiParisISO } from "@/lib/dates";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import {
  chargerVente, genererDocumentsVente, envoyerDocumentsVente, journal, dateFR,
  SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
} from "@/lib/examens";
import { facturerVente, envoyerFacture } from "@/lib/factures";
import { checkInscriptionExamen } from "@/lib/examenCarence";
import { estDirection } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const AGENCES = ["Gagny", "Sarcelles", "Rosny"];
const LIBELLE: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique", Vente_plateforme: "Vente plateforme" };

async function garde(req: NextRequest): Promise<NextResponse | { user: SessionUser }> {
  try { const user = await requireUser(req); return { user }; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

/** Mail de pré-inscription avec le lien de paiement Qonto. */
async function envoyerMailPreinscription(p: any, session: any | null): Promise<{ ok: boolean; erreur?: string }> {
  const libelle = LIBELLE[p.type_examen] ?? "Examen";
  const mention = p.sous_type ? ` — ${p.sous_type}` : "";
  const creneau = session ? `<p><strong>Créneau souhaité :</strong> le ${dateFR(session.date_examen)} (${session.horaire})</p>` : "";
  const lienBouton = p.lien_paiement
    ? `<p style="margin:18px 0"><a href="${p.lien_paiement}" style="background:#2F72DE;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Régler mon examen (${p.montant} €)</a></p>
       <p style="font-size:13px;color:#666">Si le bouton ne fonctionne pas, copiez ce lien : ${p.lien_paiement}</p>`
    : "";

  const corps = `
    <p>Bonjour ${p.candidat_prenom ?? ""},</p>
    <p>Nous confirmons la prise en compte de votre pré-inscription à MYSTORY pour : <strong>${libelle}${mention}</strong>.</p>
    ${creneau}
    <p>Pour valider définitivement votre inscription, merci de régler votre examen via le lien de paiement sécurisé ci-dessous :</p>
    ${lienBouton}
    <p>⚠️ Ce lien est valable <strong>24 à 48 h</strong>. Passé ce délai, la place pourra être réattribuée.</p>
    <p>Le jour de l'examen : présentez-vous à <strong>3 bis avenue de Gagny, 93220 Gagny</strong>, muni(e) d'une <strong>pièce d'identité en cours de validité</strong>. Une fois le paiement validé, vous recevrez votre convocation sous 24 h.</p>
    <p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
    <p>L'équipe MYSTORY</p>`;

  return envoyerEmail({
    a: p.candidat_email,
    objet: `Votre pré-inscription — ${libelle}${mention} (MYSTORY)`,
    html: gabaritEmail("Confirmation de pré-inscription", corps),
    entite: "preinscriptions_examen",
    entiteId: p.id,
    auteur: p.cree_par ?? null,
  });
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const statut = req.nextUrl.searchParams.get("statut");

  let q = supabaseAdmin.from("preinscriptions_examen")
    .select("*, sessions_examen:session_id (date_examen, horaire, type)")
    .order("cree_le", { ascending: false });
  if (statut && ["en_attente", "convertie", "expiree", "annulee"].includes(statut)) q = q.eq("statut", statut);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Sessions à venir (pour le formulaire), places en direct.
  const { data: sessions } = await supabaseAdmin.from("v_sessions_examen")
    .select("id, type, date_examen, horaire, capacite, inscrits, restantes, note")
    .gte("date_examen", aujourdhuiParisISO())
    .order("date_examen", { ascending: true });

  return NextResponse.json({ ok: true, preinscriptions: data ?? [], sessions: sessions ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const u = g.user;
  const b = await req.json().catch(() => ({} as any));

  const recap: string[] = [];
  const nom = String(b?.candidat_nom ?? "").trim();
  const prenom = String(b?.candidat_prenom ?? "").trim();
  const email = String(b?.candidat_email ?? "").trim().toLowerCase();
  const telephone = String(b?.candidat_telephone ?? "").trim() || null;
  const type = String(b?.type_examen ?? "");
  const sousType = String(b?.sous_type ?? "").trim() || null;
  const sessionId = String(b?.session_id ?? "").trim() || null;
  const montant = Number(b?.montant);
  const lien = String(b?.lien_paiement ?? "").trim();
  const agence = String(b?.agence ?? "Gagny").trim();

  if (!nom) recap.push("Nom obligatoire.");
  if (!prenom) recap.push("Prénom obligatoire.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) recap.push("Email valide obligatoire (envoi du lien).");
  if (!["TEF_IRN", "Examen_civique", "Vente_plateforme"].includes(type)) recap.push("Type d'examen invalide.");
  if (type === "Examen_civique" && !SOUS_TYPES_CIVIQUE.includes(sousType ?? "")) recap.push("Mention obligatoire pour l'examen civique.");
  if (type === "TEF_IRN" && sousType && !MOTIVATIONS_TEF.includes(sousType)) recap.push("Motivation TEF inconnue.");
  if (type === "Vente_plateforme" && !PLATEFORMES.includes(sousType ?? "")) recap.push("Application plateforme à choisir.");
  if (type !== "Vente_plateforme" && !sessionId) recap.push("Session (créneau souhaité) obligatoire.");
  if (!Number.isFinite(montant) || montant < 0) recap.push("Montant invalide.");
  if (!/^https?:\/\//.test(lien)) recap.push("Lien de paiement Qonto obligatoire (https://…).");
  if (!AGENCES.includes(agence)) recap.push("Agence : Gagny / Sarcelles / Rosny.");
  if (recap.length) return NextResponse.json({ ok: false, recap }, { status: 400 });

  const { data: p, error } = await supabaseAdmin.from("preinscriptions_examen").insert({
    candidat_nom: nom, candidat_prenom: prenom, candidat_email: email, candidat_telephone: telephone,
    type_examen: type, sous_type: sousType, session_id: type === "Vente_plateforme" ? null : sessionId,
    montant, lien_paiement: lien, agence, cree_par: u.email ?? null,
  }).select("*").single();
  if (error || !p) return NextResponse.json({ ok: false, erreur: error?.message ?? "Création impossible." }, { status: 500 });

  await journal("preinscriptions_examen", (p as any).id, "preinscription_creee",
    { type, sous_type: sousType, montant, candidat: `${prenom} ${nom}` }, u.email ?? null);

  // Session pour le mail (date/horaire).
  let session: any = null;
  if ((p as any).session_id) {
    const { data: s } = await supabaseAdmin.from("sessions_examen").select("date_examen, horaire, type").eq("id", (p as any).session_id).maybeSingle();
    session = s ?? null;
  }
  const mail = await envoyerMailPreinscription(p, session);
  if (mail.ok) await journal("preinscriptions_examen", (p as any).id, "preinscription_mail_envoye", { a: email }, u.email ?? null);

  return NextResponse.json({ ok: true, id: (p as any).id, mailEnvoye: mail.ok, mailErreur: mail.ok ? undefined : mail.erreur });
}

export async function PATCH(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const u = g.user;
  const b = await req.json().catch(() => ({} as any));
  const id = String(b?.id ?? "").trim();
  const action = String(b?.action ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const { data: p } = await supabaseAdmin.from("preinscriptions_examen").select("*").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, erreur: "Pré-inscription introuvable." }, { status: 404 });

  // ----- Annuler -----
  if (action === "annuler") {
    if ((p as any).statut === "convertie") return NextResponse.json({ ok: false, erreur: "Déjà convertie en inscription." }, { status: 400 });
    await supabaseAdmin.from("preinscriptions_examen").update({ statut: "annulee" }).eq("id", id);
    await journal("preinscriptions_examen", id, "preinscription_annulee", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  // ----- Renvoyer le mail (avec le même lien) -----
  if (action === "renvoyer") {
    if ((p as any).statut !== "en_attente") return NextResponse.json({ ok: false, erreur: "Seule une pré-inscription en attente peut être relancée." }, { status: 400 });
    let session: any = null;
    if ((p as any).session_id) {
      const { data: s } = await supabaseAdmin.from("sessions_examen").select("date_examen, horaire, type").eq("id", (p as any).session_id).maybeSingle();
      session = s ?? null;
    }
    const mail = await envoyerMailPreinscription(p, session);
    if (mail.ok) await journal("preinscriptions_examen", id, "preinscription_mail_renvoye", { a: (p as any).candidat_email }, u.email ?? null);
    return NextResponse.json({ ok: mail.ok, erreur: mail.ok ? undefined : mail.erreur });
  }

  // ----- Convertir (paiement constaté → vraie inscription) -----
  if (action === "convertir") {
    if ((p as any).statut === "convertie") return NextResponse.json({ ok: false, erreur: "Déjà convertie." }, { status: 400 });
    if ((p as any).statut === "annulee") return NextResponse.json({ ok: false, erreur: "Pré-inscription annulée." }, { status: 400 });

    const type = (p as any).type_examen as string;
    const sousType = (p as any).sous_type as string | null;
    const sessionId = (p as any).session_id as string | null;
    const estPlat = type === "Vente_plateforme";
    const carenceForcer = b?.carence_forcer === true;
    const carenceMotif = String(b?.carence_motif ?? "").trim();

    // Candidat (retrouvé par email, sinon créé).
    const email = String((p as any).candidat_email).toLowerCase();
    const identite: Record<string, unknown> = {
      nom: (p as any).candidat_nom, prenom: (p as any).candidat_prenom, email,
      telephone: (p as any).candidat_telephone ?? null, agence: (p as any).agence,
    };
    let candidatId: string;
    const { data: ex } = await supabaseAdmin.from("stagiaires").select("id").eq("email", email).maybeSingle();
    if (ex?.id) {
      candidatId = (ex as any).id;
      await supabaseAdmin.from("stagiaires").update(Object.fromEntries(Object.entries(identite).filter(([, v]) => v))).eq("id", candidatId);
    } else {
      const { data: nv, error } = await supabaseAdmin.from("stagiaires").insert(identite).select("id").single();
      if (error || !nv) return NextResponse.json({ ok: false, erreur: error?.message ?? "Création candidat impossible." }, { status: 500 });
      candidatId = (nv as any).id;
    }

    // Contrôles : place + carence (au moment du paiement).
    let dateExamen: string | null = null;
    const blocages: string[] = [];
    if (!estPlat && sessionId) {
      const { data: sess } = await supabaseAdmin.from("v_sessions_examen").select("restantes, capacite").eq("id", sessionId).maybeSingle();
      if (sess && (sess as any).restantes <= 0) {
        return NextResponse.json({ ok: false, recap: [`Session pleine (capacité ${(sess as any).capacite}). Change la session avant de convertir.`] }, { status: 409 });
      }
      const { data: s2 } = await supabaseAdmin.from("sessions_examen").select("date_examen").eq("id", sessionId).maybeSingle();
      dateExamen = (s2 as any)?.date_examen ?? null;
    }
    const car = await checkInscriptionExamen({ type, sousType, candidatId, dateExamen, declaratifTefDate: null });
    if (!car.ok) blocages.push(...car.recap);
    let carenceAppliquee = false;
    if (blocages.length) {
      if (carenceForcer && estDirection(u.roles ?? u.role) && carenceMotif) {
        carenceAppliquee = true;
        await journal("preinscriptions_examen", id, "carence_forcee", { motif: carenceMotif, recap: blocages }, u.email ?? null);
      } else if (carenceForcer && !estDirection(u.roles ?? u.role)) {
        return NextResponse.json({ ok: false, recap: [...blocages, "Seule la Direction peut forcer une carence."] }, { status: 409 });
      } else {
        return NextResponse.json({ ok: false, recap: blocages }, { status: 409 });
      }
    }

    // Création de la vente (paiement Qonto = CB / Payé).
    const venduPar = (p as any).cree_par ?? u.email ?? null;
    const { data: vente, error: vErr } = await supabaseAdmin.from("ventes_examen").insert({
      candidat_id: candidatId,
      session_id: estPlat ? null : sessionId,
      type_examen: type, sous_type: sousType,
      montant: Number((p as any).montant), mode_paiement: "CB", dont_cb: null,
      statut_paiement: "Payé", reste_a_payer: 0,
      vendu_par: venduPar, agence: (p as any).agence,
      commentaire: "Pré-inscription téléphone (paiement Qonto)",
      carence_forcee: carenceAppliquee, carence_forcee_motif: carenceAppliquee ? carenceMotif : null,
      numero_attestation: "ATTRIBUE_PAR_LE_SERVEUR",
    }).select("id, numero_attestation").single();
    if (vErr || !vente) return NextResponse.json({ ok: false, erreur: vErr?.message ?? "Création de l'inscription impossible." }, { status: 500 });

    const venteId = (vente as any).id as string;
    const numero = (vente as any).numero_attestation as string;
    await journal("ventes_examen", venteId, "examen_vendu", { numero_attestation: numero, type, sous_type: sousType, montant: Number((p as any).montant), agence: (p as any).agence, origine: "preinscription" }, venduPar);

    // Documents + email + facture.
    let envoiOk = false; let erreurDocs: string | null = null;
    let facture: { numero: string; envoyee: boolean; erreur?: string } | null = null;
    try {
      const vc = (await chargerVente(venteId))!;
      const docs = await genererDocumentsVente(vc);
      const envoi = await envoyerDocumentsVente(vc, docs);
      envoiOk = envoi.ok;
      if (envoi.ok) {
        const maintenant = new Date().toISOString();
        const maj: Record<string, string> = {};
        if (docs.some((d) => d.piece === "convocation")) maj.convocation_envoyee_le = maintenant;
        if (docs.some((d) => d.piece === "attestation")) maj.attestation_envoyee_le = maintenant;
        if (Object.keys(maj).length) await supabaseAdmin.from("ventes_examen").update(maj).eq("id", venteId);
      }
    } catch (err: any) { erreurDocs = err?.message ?? String(err); }

    try {
      const f = await facturerVente(venteId, venduPar);
      const ef = await envoyerFacture(f.id, "emission", venduPar);
      facture = { numero: f.numero, envoyee: ef.ok, erreur: ef.erreur };
    } catch (err: any) { facture = { numero: "", envoyee: false, erreur: err?.message ?? String(err) }; }

    await supabaseAdmin.from("preinscriptions_examen").update({
      statut: "convertie", vente_id: venteId, converti_par: u.email ?? null, converti_le: new Date().toISOString(),
    }).eq("id", id);
    await journal("preinscriptions_examen", id, "preinscription_convertie", { vente_id: venteId, numero_attestation: numero }, u.email ?? null);

    return NextResponse.json({ ok: true, venteId, numeroAttestation: numero, email: { envoye: envoiOk, erreur: erreurDocs }, facture });
  }

  return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
}
