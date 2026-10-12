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
import { requireUser, requireRole, UnauthorizedError, ForbiddenError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
/* 12/10/2026 — sept imports retirés avec le chemin de conversion supprimé :
   `chargerVente`, `genererDocumentsVente`, `envoyerDocumentsVente`, `facturerVente`,
   `envoyerFacture`, `checkInscriptionExamen` et `estDirection`. Cette route ne crée
   plus de vente, n'émet plus de document et ne facture plus : elle enregistre une
   pré-inscription, la relance, l'annule, ou la clôt quand le robot l'a portée au
   classeur. Les contrôles de carence et de place vivent désormais là où la vente est
   réellement créée. */
import {
  journal, dateFR, SOUS_TYPES_CIVIQUE, MOTIVATIONS_TEF, PLATEFORMES,
} from "@/lib/examens";

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
    <p>Pour toute question : 06 81 43 16 54 · secretariat@mystoryformation.fr</p>
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

    /* 12/10/2026 — une pré-inscription PAYÉE ne s'annule pas d'un clic.
     *
     * Depuis que la bascule est automatique, cette file est le seul chemin par
     * lequel une vente du site devient une inscription. Annuler une ligne payée la
     * fait sortir de la file définitivement : le robot l'ignore, et
     * `porte_au_classeur` la refuse ensuite. L'argent est encaissé et le candidat
     * n'a plus ni convocation ni attestation, sans que rien ne le signale.
     *
     * Je venais de restreindre `porte_au_classeur` à la Direction en laissant cette
     * action-ci ouverte à toute l'équipe : la protection ne valait rien, puisque les
     * deux chemins font disparaître le même encaissement.
     *
     * Un encaissement qu'il faut vraiment défaire est un remboursement, et le
     * remboursement a son propre circuit, avec son avoir et sa trace. */
    if ((p as any).paye_le) {
      try {
        await requireRole(req, ["direction"]);
      } catch (e) {
        if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
        if (e instanceof ForbiddenError) {
          return NextResponse.json({
            ok: false,
            erreur:
              "Cette pré-inscription est PAYÉE : elle ne peut pas être annulée ici. " +
              "L'annuler ferait disparaître l'encaissement de la file d'inscription, " +
              "sans convocation ni attestation pour le candidat. Passer par le circuit " +
              "Report et Remboursement, ou en parler à la Direction.",
          }, { status: 403 });
        }
        throw e;
      }
      await journal("preinscriptions_examen", id, "preinscription_payee_annulee_par_direction",
        { montant: (p as any).montant, paye_le: (p as any).paye_le }, u.email ?? null);
    }

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

  /* ----- Marquer « portée au classeur » (12/10/2026) -----
   *
   * Appelée par le robot « Ventes du site vers le classeur » après qu'il a écrit la
   * ligne dans l'onglet Examens et coché l'envoi. Elle ne crée AUCUNE vente et
   * n'émet aucun document : elle ferme seulement la pré-inscription pour qu'elle ne
   * soit pas traitée deux fois au passage suivant.
   *
   * `vente_id` reste vide, et c'est voulu : la vente vit dans le classeur, qui est
   * l'émetteur de la série. Prétendre le contraire en inventant un identifiant
   * Supabase donnerait un lien mort. */
  if (action === "porte_au_classeur") {
    /* Garde renforcée, comme `/api/examens/ventes-en-ligne` : cette action CLÔT une
       vente payée. Avec le seul `requireUser` de `garde()`, n'importe quelle session
       d'équipe pouvait la marquer traitée avec un numéro inventé, et l'encaissement
       disparaissait de la file sans qu'aucun document ne soit parti. `requireRole`
       laisse passer le jeton de service n8n (exemption `estAutomate`), donc le robot
       fonctionne, et personne d'autre que la Direction ne peut l'appeler à la main. */
    try {
      await requireRole(req, ["direction"]);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
      if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé au robot et à la Direction" }, { status: 403 });
      throw e;
    }
    if ((p as any).statut === "convertie") return NextResponse.json({ ok: true, deja: true });
    if ((p as any).statut === "annulee") return NextResponse.json({ ok: false, erreur: "Pré-inscription annulée." }, { status: 400 });
    if (!(p as any).paye_le) return NextResponse.json({ ok: false, erreur: "Pré-inscription non payée : rien à porter au classeur." }, { status: 409 });
    const numero = String(b?.numero_attestation ?? "").trim();
    if (!/^MYS-\d{4}-\d{5}$/.test(numero)) {
      return NextResponse.json({ ok: false, erreur: "numero_attestation attendu au format MYS-AAAA-NNNNN." }, { status: 400 });
    }
    await supabaseAdmin.from("preinscriptions_examen").update({
      statut: "convertie",
      converti_par: u.email ?? "robot@mystoryformation.fr",
      converti_le: new Date().toISOString(),
    }).eq("id", id);
    await journal("preinscriptions_examen", id, "preinscription_portee_au_classeur",
      { numero_attestation: numero }, u.email ?? "robot@mystoryformation.fr");
    return NextResponse.json({ ok: true, numero_attestation: numero });
  }

  /* ----- Convertir : CHEMIN FERMÉ depuis le 12/10/2026 -----
   *
   * Ce chemin créait la vente dans Supabase avec `numero_attestation` à
   * 'ATTRIBUE_PAR_LE_SERVEUR', en attendant un trigger qui le remplace. Ce trigger a
   * été retiré le 09/10 quand le classeur Examens est devenu le seul émetteur de la
   * série. Résultat : toute vente créée ici depuis cette date portait ce texte en
   * guise de numéro, et il partait imprimé sur l'attestation du candidat. ZAKRI
   * Mohamed en a reçu une le 12/10 à 10h35.
   *
   * On ne le répare pas, on le ferme : le CRM ne peut pas écrire dans le classeur,
   * donc il ne peut pas émettre un numéro juste. C'est le robot « Ventes du site
   * vers le classeur » qui fait le travail, toutes les 15 minutes, et la base refuse
   * désormais le mot-clé à l'insertion.
   *
   * ⚠️ Ne pas rouvrir ce chemin sans régler d'abord la question de l'émetteur. */
  if (action === "convertir") {
    return NextResponse.json({
      ok: false,
      erreur:
        "La bascule est automatique depuis le 12/10/2026 : le robot porte la vente au classeur " +
        "et envoie convocation et attestation dans les 15 minutes qui suivent le paiement. " +
        "Il n'y a rien à cliquer. Si une vente payée n'est pas partie au bout d'une heure, " +
        "prévenir Arudhan plutôt que de la créer à la main : le numéro d'attestation vient " +
        "du classeur, et le CRM ne sait pas l'attribuer.",
      recap: ["Chemin fermé : la bascule se fait toute seule."],
    }, { status: 409 });
  }

  /* L'ancien chemin de conversion a été SUPPRIMÉ le 12/10/2026, pas désactivé.
     Je l'avais d'abord renommé en `convertir_desactive_le_12102026` en le croyant
     hors d'atteinte : c'était faux, il suffisait d'envoyer ce nom d'action pour le
     réexécuter en entier, mot-clé compris. Un chemin que l'on veut mort doit
     disparaître du code, l'historique Git suffit à le retrouver. */

  return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
}
