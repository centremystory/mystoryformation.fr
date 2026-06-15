/**
 * MYSTORY — GET /api/examens/jour?date=AAAA-MM-JJ
 * Le jour J en une réponse : sessions de la date (groupées par type, triées par horaire)
 * avec leurs candidats (hors Remboursé/Annulé), l'inscription CCI, le paiement et le
 * résultat éventuel. Sert la feuille de présence et la saisie des résultats.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  const date = req.nextUrl.searchParams.get("date")
    ?? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, erreur: "date invalide (AAAA-MM-JJ)." }, { status: 400 });
  }

  const { data: sessions, error } = await supabaseAdmin
    .from("sessions_examen").select("*")
    .eq("date_examen", date)
    .order("type").order("horaire");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const ids = (sessions ?? []).map((s: any) => s.id);
  let ventes: any[] = [];
  if (ids.length > 0) {
    const { data, error: vErr } = await supabaseAdmin
      .from("ventes_examen")
      .select("id, session_id, type_examen, sous_type, statut_paiement, reste_a_payer, inscrit_cci, numero_attestation, vendu_par, agence, stagiaires:candidat_id (civilite, nom, prenom, email, telephone), resultats_examen (statut, niveau_obtenu, envoye_le, commentaire)")
      .in("session_id", ids)
      .not("statut_paiement", "in", "(\"Remboursé\",\"Annulé\")")
      .order("created_at");
    if (vErr) return NextResponse.json({ ok: false, erreur: vErr.message }, { status: 500 });
    ventes = data ?? [];
  }

  const parSession = (sessions ?? []).map((s: any) => ({
    ...s,
    candidats: ventes
      .filter((v) => v.session_id === s.id)
      .map((v) => ({
        venteId: v.id,
        numero_attestation: v.numero_attestation,
        civilite: v.stagiaires?.civilite ?? "",
        nom: v.stagiaires?.nom ?? "",
        prenom: v.stagiaires?.prenom ?? "",
        email: v.stagiaires?.email ?? "",
        telephone: v.stagiaires?.telephone ?? "",
        sous_type: v.sous_type,
        type_examen: v.type_examen,
        inscrit_cci: v.inscrit_cci,
        statut_paiement: v.statut_paiement,
        reste_a_payer: v.reste_a_payer,
        resultat: v.resultats_examen?.statut ?? null,
        niveau_obtenu: v.resultats_examen?.niveau_obtenu ?? null,
        resultat_envoye: v.resultats_examen?.envoye_le ?? null,
        commentaire: v.resultats_examen?.commentaire ?? null,
      })),
  }));

  return NextResponse.json({ ok: true, date, sessions: parSession });
}
