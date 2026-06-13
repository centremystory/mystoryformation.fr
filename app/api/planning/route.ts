/**
 * MYSTORY — GET /api/planning
 * Liste les séances de formation (table planning) avec le contexte stagiaire/agence/formatrice,
 * pour le planning des élèves par site. Lecture seule. Auth obligatoire (équipe).
 * Le filtrage par agence et par période se fait côté page (jeu de données réduit).
 * Rappel : le lieu de formation des documents reste toujours Gagny — l'agence ici est
 * l'agence d'inscription du stagiaire, pour le suivi interne par site.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { validerPlanning, type CodeFormule, type SeanceInput } from "@/lib/inscriptions/regles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data, error } = await supabaseAdmin
    .from("planning")
    .select(`
      id, date_seance, demi_journee, heures, emarge_le, formatrice_id,
      absence, absence_motif, absence_le,
      dossier:dossiers!dossier_id ( id, certif, statut, stagiaire:stagiaires!stagiaire_id ( prenom, nom, agence ) ),
      formatrice:formatrices!formatrice_id ( nom, prenom )
    `)
    .order("date_seance", { ascending: true })
    .order("demi_journee", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const seances = (data ?? []).map((r: any) => ({
    id: r.id,
    date_seance: r.date_seance,
    demi_journee: r.demi_journee,
    heures: Number(r.heures),
    emarge_le: r.emarge_le,
    formatrice_id: r.formatrice_id ?? null,
    absence: r.absence === true,
    absence_motif: r.absence_motif ?? null,
    absence_le: r.absence_le ?? null,
    dossier_id: r.dossier?.id ?? null,
    certif: r.dossier?.certif ?? null,
    statut_dossier: r.dossier?.statut ?? null,
    stagiaire: r.dossier?.stagiaire ? `${r.dossier.stagiaire.prenom ?? ""} ${r.dossier.stagiaire.nom ?? ""}`.trim() : "—",
    agence: r.dossier?.stagiaire?.agence ?? null,
    formatrice: r.formatrice ? `${r.formatrice.prenom ?? ""} ${r.formatrice.nom ?? ""}`.trim() : null,
  }));

  return NextResponse.json({ ok: true, lieu_formation: "Gagny", seances });
}

/** Reconstruit une SeanceInput (pour validerPlanning) à partir d'une ligne planning. */
function seanceInput(date: string, demi: string, heures: number): SeanceInput {
  const dj = demi === "matin" ? "MATIN" : "APRES_MIDI";
  if (heures === 1) return { date, creneau: "FINALE_1H", demiJournee: dj };
  if (heures === 2) return { date, creneau: "FINALE_2H", demiJournee: dj };
  return { date, creneau: dj };
}

/**
 * PATCH /api/planning — décaler une séance (date + demi-journée) et/ou réassigner la formatrice.
 * Garde-fous : séance déjà émargée = verrouillée ; pas de date dans le passé (anti-antidatage) ;
 * formatrice active + justificatif FLE ; re-validation complète du planning du dossier
 * (total d'heures, finale en dernier, pas de doublon de créneau, délai 11 j ouvrés).
 * Les heures de la séance restent constantes (on déplace, on n'ajoute/supprime pas).
 */
export async function PATCH(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const date = body?.date_seance != null ? String(body.date_seance).trim() : null;
  const demi = body?.demi_journee != null ? String(body.demi_journee).trim() : null;
  const formatriceId = body?.formatrice_id != null ? String(body.formatrice_id).trim() : null;

  if (!id) return NextResponse.json({ ok: false, erreur: "Identifiant de séance requis." }, { status: 400 });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, erreur: "Date invalide (YYYY-MM-DD)." }, { status: 400 });
  if (demi && demi !== "matin" && demi !== "apres_midi") return NextResponse.json({ ok: false, erreur: "Demi-journée invalide." }, { status: 400 });

  // Séance ciblée
  const { data: seance, error: eSeance } = await supabaseAdmin
    .from("planning")
    .select("id, dossier_id, date_seance, demi_journee, heures, emarge_le, signature_stagiaire_url, signature_formatrice_url")
    .eq("id", id)
    .maybeSingle();
  if (eSeance) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });
  if (!seance) return NextResponse.json({ ok: false, erreur: "Séance introuvable." }, { status: 404 });
  if (seance.emarge_le || seance.signature_stagiaire_url || seance.signature_formatrice_url)
    return NextResponse.json({ ok: false, erreur: "Séance déjà émargée (ou signature en cours) : modification interdite." }, { status: 409 });

  const newDate = date ?? seance.date_seance;
  const newDemi = demi ?? seance.demi_journee;

  // Anti-antidatage : une séance ne peut pas être placée dans le passé (heure de Paris)
  const aujourdHuiParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  if (newDate < aujourdHuiParis)
    return NextResponse.json({ ok: false, erreur: "Anti-antidatage : une séance ne peut pas être placée dans le passé." }, { status: 409 });

  // Formatrice : active + justificatif FLE (si réassignation demandée)
  if (formatriceId) {
    const { data: f, error: eF } = await supabaseAdmin
      .from("formatrices").select("id").eq("id", formatriceId).eq("actif", true).eq("justificatif_fle", true).maybeSingle();
    if (eF) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });
    if (!f) return NextResponse.json({ ok: false, erreur: "Formatrice invalide (active + justificatif FLE requis)." }, { status: 409 });
  }

  // Dossier : total d'heures vendu + date de validation de commande
  const { data: dossier, error: eD } = await supabaseAdmin
    .from("dossiers").select("heures_prevues, date_validation_commande").eq("id", seance.dossier_id).maybeSingle();
  if (eD) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  // Reconstruire le planning complet avec la modification, puis valider
  const { data: toutes, error: eT } = await supabaseAdmin
    .from("planning").select("id, date_seance, demi_journee, heures").eq("dossier_id", seance.dossier_id);
  if (eT) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });

  const reconstruit: SeanceInput[] = (toutes ?? []).map((p: any) =>
    seanceInput(p.id === id ? newDate : p.date_seance, p.id === id ? newDemi : p.demi_journee, Number(p.heures))
  );

  const code = ({ 6: "6H", 16: "16H", 26: "26H" } as Record<number, CodeFormule>)[Number(dossier.heures_prevues)];
  if (!code) return NextResponse.json({ ok: false, erreur: "Formule du dossier non reconnue." }, { status: 409 });

  const v = validerPlanning(code, reconstruit, dossier.date_validation_commande ?? null);
  if (!v.ok) return NextResponse.json({ ok: false, erreur: v.erreurs.join(" ") }, { status: 409 });

  // Appliquer (heures inchangées)
  const patch: any = { date_seance: newDate, demi_journee: newDemi };
  if (formatriceId) patch.formatrice_id = formatriceId;
  const { error: eU } = await supabaseAdmin.from("planning").update(patch).eq("id", id);
  if (eU) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
