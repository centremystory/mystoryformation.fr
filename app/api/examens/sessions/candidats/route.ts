// app/api/examens/sessions/candidats/route.ts
// Liste des candidats inscrits à UNE session d'examen (lecture seule).
// Sert l'écran /examens/sessions/[id] (voir les inscrits + reporter/rembourser au téléphone).
// Protégé par le middleware global. Données personnelles → service_role uniquement.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";
import { statutExamen } from "@/lib/statutExamen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("session");
  if (!sessionId) return NextResponse.json({ ok: false, erreur: "Session manquante." }, { status: 400 });

  const { data: session, error: e1 } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, type, date_examen, horaire, capacite, note")
    .eq("id", sessionId)
    .maybeSingle();
  if (e1 || !session) return NextResponse.json({ ok: false, erreur: "Session introuvable." }, { status: 404 });

  const { data: ventes, error: e2 } = await supabaseAdmin
    .from("ventes_examen")
    .select(
      "id, type_examen, sous_type, statut_paiement, montant, reste_a_payer, numero_attestation, numero_vente, convocation_envoyee_le, vendu_par, created_at, stagiaires:candidat_id ( civilite, nom, prenom, telephone, email )"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (e2) return NextResponse.json({ ok: false, erreur: "Lecture des candidats impossible." }, { status: 500 });

  const ids = (ventes ?? []).map((v: any) => v.id);
  const parVente = new Map<string, any>();
  if (ids.length) {
    const { data: res } = await supabaseAdmin
      .from("resultats_examen")
      .select("vente_id, statut, niveau_obtenu, envoye_le")
      .in("vente_id", ids);
    (res ?? []).forEach((r: any) => { if (r.vente_id) parVente.set(r.vente_id, r); });
  }

  const candidats = (ventes ?? []).map((v: any) => {
    const r = parVente.get(v.id);
    const resultat = r ? { statut: r.statut, niveau_obtenu: r.niveau_obtenu, envoye_le: r.envoye_le } : null;
    return {
      vente_id: v.id,
      civilite: v.stagiaires?.civilite ?? "",
      nom: v.stagiaires?.nom ?? "",
      prenom: v.stagiaires?.prenom ?? "",
      telephone: v.stagiaires?.telephone ?? "",
      email: v.stagiaires?.email ?? "",
      type_examen: v.type_examen,
      sous_type: v.sous_type,
      statut_paiement: v.statut_paiement,
      montant: v.montant,
      reste_a_payer: v.reste_a_payer,
      numero_attestation: v.numero_attestation,
      numero_vente: v.numero_vente,
      convocation_envoyee_le: v.convocation_envoyee_le,
      vendu_par: v.vendu_par,
      resultat,
      statut_examen: statutExamen({ statut_paiement: v.statut_paiement, date_examen: session.date_examen, resultat }),
    };
  });

  return NextResponse.json({ ok: true, session, candidats });
}
