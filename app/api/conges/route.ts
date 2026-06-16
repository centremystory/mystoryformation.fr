/**
 * MYSTORY — /api/conges  (demandes de congés — bloc RH)
 * GET   ?statut=  → Direction/staff voient tout ; un employé voit ses propres demandes. ({peutValider, demandes})
 * POST  { type, dateDebut, dateFin, motif? }  → crée une demande pour l'utilisateur connecté.
 * PATCH { id, action:"approuver"|"refuser"|"annuler", commentaire? }
 *        approuver/refuser = Direction ; annuler = le demandeur (sa propre demande) ou la Direction.
 * Pas de suppression (annulation = statut). Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["conges_payes", "sans_solde", "maladie", "rtt", "autre"];
// Direction (ou session équipe "staff", ou jeton de service sans rôle) peut valider.
function peutValider(role?: string): boolean {
  return !role || role === "staff" || role === "direction";
}

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const valid = peutValider(u.role);
  const statut = req.nextUrl.searchParams.get("statut");
  let q = supabaseAdmin
    .from("conges")
    .select("id, utilisateur_id, type, date_debut, date_fin, motif, statut, decide_par, decide_le, commentaire_decision, remplace_par, cree_le, utilisateurs(nom, prenom, email)")
    .order("date_debut", { ascending: false });
  if (!valid) {
    if (!u.id) return NextResponse.json({ ok: true, peutValider: false, demandes: [] });
    q = q.eq("utilisateur_id", u.id);
  }
  if (statut) q = q.eq("statut", statut);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, peutValider: valid, demandes: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!u.id) return NextResponse.json({ ok: false, erreur: "Connecte-toi avec ton compte individuel pour déposer une demande." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const type = String(b?.type ?? "conges_payes").trim();
  const dateDebut = String(b?.dateDebut ?? "").trim();
  const dateFin = String(b?.dateFin ?? "").trim();
  const motif = String(b?.motif ?? "").trim() || null;
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut) || !/^\d{4}-\d{2}-\d{2}$/.test(dateFin))
    return NextResponse.json({ ok: false, erreur: "Dates requises (début et fin)." }, { status: 400 });
  if (dateFin < dateDebut) return NextResponse.json({ ok: false, erreur: "La date de fin doit être après la date de début." }, { status: 400 });

  // L'utilisateur doit exister (FK) — pas de demande orpheline.
  const { data: util } = await supabaseAdmin.from("utilisateurs").select("id").eq("id", u.id).single();
  if (!util) return NextResponse.json({ ok: false, erreur: "Compte introuvable." }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("conges").insert({ utilisateur_id: u.id, type, date_debut: dateDebut, date_fin: dateFin, motif }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("conges", (data as any).id, "conges_demande", { type, dateDebut, dateFin }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  const action = String(b?.action ?? "").trim();
  const commentaire = String(b?.commentaire ?? "").trim() || null;
  const remplacePar = String(b?.remplacePar ?? "").trim() || null;
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const { data: demande, error: eDem } = await supabaseAdmin
    .from("conges").select("id, utilisateur_id, statut").eq("id", id).single();
  if (eDem || !demande) return NextResponse.json({ ok: false, erreur: "Demande introuvable." }, { status: 404 });
  const d = demande as any;

  if (action === "approuver" || action === "refuser") {
    if (!peutValider(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    if (d.statut !== "en_attente") return NextResponse.json({ ok: false, erreur: "Demande déjà traitée." }, { status: 409 });
    const statut = action === "approuver" ? "approuve" : "refuse";
    const maj: Record<string, unknown> = {
      statut, decide_par: u.email ?? null, decide_le: new Date().toISOString(), commentaire_decision: commentaire,
    };
    if (action === "approuver") maj.remplace_par = remplacePar; // remplaçant pendant l'absence
    const { error } = await supabaseAdmin.from("conges").update(maj).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("conges", id, action === "approuver" ? "conges_approuve" : "conges_refuse", { commentaire, remplace_par: action === "approuver" ? remplacePar : null }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  if (action === "annuler") {
    const estProprietaire = u.id && d.utilisateur_id === u.id;
    if (!estProprietaire && !peutValider(u.role)) return NextResponse.json({ ok: false, erreur: "Action non autorisée." }, { status: 403 });
    if (!["en_attente", "approuve"].includes(d.statut)) return NextResponse.json({ ok: false, erreur: "Demande non annulable." }, { status: 409 });
    const { error } = await supabaseAdmin.from("conges").update({ statut: "annule", decide_par: u.email ?? null, decide_le: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("conges", id, "conges_annule", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  if (action === "remplacant") {
    if (!peutValider(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    if (!["en_attente", "approuve"].includes(d.statut)) return NextResponse.json({ ok: false, erreur: "Demande non modifiable." }, { status: 409 });
    const { error } = await supabaseAdmin.from("conges").update({ remplace_par: remplacePar }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("conges", id, "conges_remplacant", { remplace_par: remplacePar }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erreur: "Action inconnue." }, { status: 400 });
}
