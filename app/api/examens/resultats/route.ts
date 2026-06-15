/**
 * MYSTORY — /api/examens/resultats
 * POST { venteId, statut: Réussi|Échoué|Absent, niveau_obtenu? } → saisie (upsert) + journal.
 * PUT  { date: AAAA-MM-JJ } → « Envoyer tous les résultats » : email à chaque candidat de la
 *      date dont le résultat est saisi et pas encore envoyé (idempotent — envoye_le horodaté).
 *      Échoué / Absent → événement `relance_commerciale` au journal (repris par /alertes et n8n).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { dateFR, journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function garde(req: NextRequest) {
  try { await requireUser(req); return null; }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const statut = String(body?.statut ?? "");
  if (!["Réussi", "Échoué", "Absent"].includes(statut)) {
    return NextResponse.json({ ok: false, erreur: "statut (Réussi | Échoué | Absent) requis." }, { status: 400 });
  }
  // Niveau : seulement si Réussi, borné A1→B2 (échelle TEF IRN) ; sinon null.
  const niveauBrut = String(body?.niveau_obtenu ?? "").trim();
  const niveau = statut === "Réussi" && ["A1", "A2", "B1", "B2"].includes(niveauBrut) ? niveauBrut : null;
  const auteur = u.email ?? (String(body?.auteur ?? "").trim() || null);
  const present = statut !== "Absent";

  // Cible : une vente (venteId ou source='vente') OU un candidat importé (examenRef + source='import').
  let venteId = String(body?.venteId ?? "").trim();
  const examenRef = String(body?.examenRef ?? "").trim();
  const source = String(body?.source ?? "").trim();
  if (!venteId && source === "vente" && examenRef) venteId = examenRef;

  if (venteId) {
    const { data: vente } = await supabaseAdmin
      .from("ventes_examen").select("id, type_examen, numero_attestation").eq("id", venteId).maybeSingle();
    if (!vente) return NextResponse.json({ ok: false, erreur: "Vente introuvable." }, { status: 404 });

    const { error } = await supabaseAdmin.from("resultats_examen").upsert(
      { vente_id: venteId, examen_ref: venteId, source: "vente", statut, niveau_obtenu: niveau, present, date_saisie: new Date().toISOString(), envoye_le: null, auteur },
      { onConflict: "vente_id" },
    );
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

    await journal("ventes_examen", venteId, "resultat_saisi",
      { numero_attestation: (vente as any).numero_attestation, statut, niveau_obtenu: niveau }, auteur);
    if (statut === "Échoué" || statut === "Absent") {
      await journal("ventes_examen", venteId, "relance_commerciale",
        { motif: statut === "Échoué" ? "Examen échoué" : "Absent à l'examen" }, auteur);
    }
    return NextResponse.json({ ok: true });
  }

  if (examenRef && source === "import") {
    const { error } = await supabaseAdmin.from("resultats_examen").upsert(
      { examen_ref: examenRef, source: "import", vente_id: null, statut, niveau_obtenu: niveau, present, date_saisie: new Date().toISOString(), envoye_le: null, auteur },
      { onConflict: "examen_ref,source" },
    );
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("examens", examenRef, "resultat_saisi", { statut, niveau_obtenu: niveau }, auteur);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erreur: "venteId ou (examenRef + source) requis." }, { status: 400 });
}

/**
 * PATCH { venteId, commentaire } → met à jour UNIQUEMENT le commentaire d'un résultat déjà saisi.
 * N'altère ni `statut` ni `envoye_le` (pas de ré-armement de l'envoi). Le commentaire s'attache
 * à une ligne résultat existante (la contrainte CHECK impose un statut non-null sur la ligne).
 */
export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const venteId = String(body?.venteId ?? "").trim();
  if (!venteId) return NextResponse.json({ ok: false, erreur: "venteId requis." }, { status: 400 });
  const brut = body?.commentaire == null ? "" : String(body.commentaire).trim();
  const commentaire = brut.length ? brut.slice(0, 2000) : null;
  const auteur = u.email ?? (String(body?.auteur ?? "").trim() || null);

  const { data: existant } = await supabaseAdmin
    .from("resultats_examen").select("id").eq("vente_id", venteId).maybeSingle();
  if (!existant) {
    return NextResponse.json({ ok: false, erreur: "Saisir d'abord un résultat avant d'ajouter un commentaire." }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("resultats_examen").update({ commentaire }).eq("vente_id", venteId);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("ventes_examen", venteId, "resultat_commentaire", { commentaire }, auteur);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const refus = await garde(req); if (refus) return refus;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const date = String(body?.date ?? "");
  const auteur = String(body?.auteur ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, erreur: "date requise (AAAA-MM-JJ)." }, { status: 400 });
  }

  const { data: sessions } = await supabaseAdmin.from("sessions_examen").select("id, type").eq("date_examen", date);
  const ids = (sessions ?? []).map((s: any) => s.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, envoyes: 0, restants: 0 });

  const { data: ventes, error } = await supabaseAdmin
    .from("ventes_examen")
    .select("id, type_examen, numero_attestation, stagiaires:candidat_id (prenom, nom, email), resultats_examen (statut, niveau_obtenu, envoye_le)")
    .in("session_id", ids)
    .not("statut_paiement", "in", "(\"Remboursé\",\"Annulé\")");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  let envoyes = 0, echecs = 0, sansSaisie = 0;
  for (const v of (ventes ?? []) as any[]) {
    const r = v.resultats_examen;
    if (!r?.statut) { sansSaisie++; continue; }
    if (r.envoye_le) continue; // déjà envoyé — idempotent
    const email = v.stagiaires?.email;
    if (!email) { echecs++; continue; }

    const estTef = v.type_examen === "TEF_IRN";
    let corps: string;
    if (r.statut === "Réussi") {
      corps = `<p>Bonjour ${v.stagiaires?.prenom ?? ""},</p>
        <p>Félicitations 🎉 Vous avez <strong>réussi</strong> votre examen du ${dateFR(date)}${estTef && r.niveau_obtenu ? ` — niveau atteint : <strong>${r.niveau_obtenu}</strong>` : ""}.</p>
        <p>${estTef
          ? "La CCI Paris Île-de-France vous enverra le lien vers votre coffre-fort numérique pour télécharger votre attestation officielle (10 à 15 jours, délai indicatif)."
          : "La CCI Paris Île-de-France vous enverra le lien vers votre coffre-fort numérique pour télécharger votre attestation officielle (24 à 48 h, délai indicatif)."}</p>
        <p>Toute l'équipe MYSTORY vous félicite !</p>`;
    } else if (r.statut === "Échoué") {
      corps = `<p>Bonjour ${v.stagiaires?.prenom ?? ""},</p>
        <p>Le résultat de votre examen du ${dateFR(date)} n'a malheureusement pas atteint le seuil requis.</p>
        <p>Ne vous découragez pas : une nouvelle session peut être programmée rapidement, et nos entraînements augmentent fortement les chances de réussite. Notre équipe va vous contacter pour en parler — vous pouvez aussi nous joindre au 06 81 43 16 54.</p>
        <p>L'équipe MYSTORY</p>`;
    } else {
      corps = `<p>Bonjour ${v.stagiaires?.prenom ?? ""},</p>
        <p>Vous étiez attendu(e) à la session d'examen du ${dateFR(date)} et nous n'avons pas pu vous accueillir.</p>
        <p>Contactez-nous au 06 81 43 16 54 ou à contact@mystoryformation.fr pour faire le point sur votre situation.</p>
        <p>L'équipe MYSTORY</p>`;
    }

    const res = await envoyerEmail({
      a: email,
      objet: `Votre résultat d'examen du ${dateFR(date)} — MYSTORY (${v.numero_attestation})`,
      html: gabaritEmail("Résultat d'examen", corps),
      entite: "ventes_examen", entiteId: v.id, auteur,
    });
    if (res.ok) {
      await supabaseAdmin.from("resultats_examen").update({ envoye_le: new Date().toISOString() }).eq("vente_id", v.id);
      envoyes++;
    } else {
      echecs++;
    }
  }

  await journal("sessions_examen", null, "resultats_envoyes", { date, envoyes, echecs, sans_saisie: sansSaisie }, auteur);
  return NextResponse.json({ ok: true, envoyes, echecs, sansSaisie });
}

