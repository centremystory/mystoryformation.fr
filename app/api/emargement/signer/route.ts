/**
 * MYSTORY — Émargement : signature d'une demi-journée (accès mixte).
 *
 * GET  ?token=...            (public) → contexte de la séance pour la page QR du stagiaire.
 * POST { role, signature, … }         → enregistre une signature (stagiaire OU formatrice).
 *
 * Sécurité :
 *  • role = "stagiaire" : autorisé par JETON de séance (QR, capability non devinable) OU par session.
 *  • role = "formatrice" : session obligatoire (jamais par jeton).
 * Conformité : aucune heure n'est posée ici — c'est le trigger SQL `trg_planning_emargement`
 * qui, une fois les DEUX signatures présentes, fixe emarge_le = now() (serveur) et heures_realisees.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { recomputeDossierStatus } from "@/lib/crm";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "documents";
const LIBELLE_DEMI: Record<string, string> = { matin: "Matin (9h30–12h30)", apres_midi: "Après-midi (14h–17h)" };

function dateFR(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}

type SeanceRow = {
  id: string; dossier_id: string; date_seance: string; demi_journee: string;
  signature_stagiaire_url: string | null; signature_formatrice_url: string | null; emarge_le: string | null;
};

async function seanceParToken(token: string): Promise<SeanceRow | null> {
  const { data } = await supabaseAdmin
    .from("planning")
    .select("id, dossier_id, date_seance, demi_journee, signature_stagiaire_url, signature_formatrice_url, emarge_le")
    .eq("emargement_token", token).maybeSingle();
  return (data as SeanceRow) ?? null;
}
async function seanceParId(id: string): Promise<SeanceRow | null> {
  const { data } = await supabaseAdmin
    .from("planning")
    .select("id, dossier_id, date_seance, demi_journee, signature_stagiaire_url, signature_formatrice_url, emarge_le")
    .eq("id", id).maybeSingle();
  return (data as SeanceRow) ?? null;
}

// --------------------------------------------------------------------------
// GET — contexte pour la page de signature du stagiaire (QR)
// --------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });

  const seance = await seanceParToken(token);
  if (!seance) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 404 });

  const { data: dossier } = await supabaseAdmin
    .from("dossiers").select("stagiaire:stagiaires!stagiaire_id ( prenom, nom )").eq("id", seance.dossier_id).maybeSingle();
  const st = (dossier as any)?.stagiaire;

  return NextResponse.json({
    ok: true,
    prenom: st?.prenom ?? "", nom: st?.nom ?? "",
    date: dateFR(seance.date_seance),
    demi: LIBELLE_DEMI[seance.demi_journee] ?? seance.demi_journee,
    lieu: "Gagny — 3 bis av. de Gagny, 93220",
    deja_signe_stagiaire: !!seance.signature_stagiaire_url,
    complet: !!seance.emarge_le,
  });
}

// --------------------------------------------------------------------------
// POST — enregistre une signature (stagiaire ou formatrice)
// --------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const role = String(body?.role ?? "").trim();
  const token = String(body?.token ?? "").trim();
  const signature = String(body?.signature ?? "");
  if (role !== "stagiaire" && role !== "formatrice") {
    return NextResponse.json({ ok: false, erreur: "Rôle invalide." }, { status: 400 });
  }

  // Résolution de la séance + contrôle d'accès.
  let seance: SeanceRow | null = null;
  if (token) {
    if (role !== "stagiaire") {
      return NextResponse.json({ ok: false, erreur: "Le jeton n'autorise que la signature du stagiaire." }, { status: 403 });
    }
    seance = await seanceParToken(token);
    if (!seance) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 404 });
  } else {
    // Pas de jeton → session obligatoire (tablette du centre).
    try { await requireUser(req); }
    catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
      throw e;
    }
    const seanceId = String(body?.seanceId ?? "").trim();
    if (!seanceId) return NextResponse.json({ ok: false, erreur: "seanceId requis." }, { status: 400 });
    seance = await seanceParId(seanceId);
    if (!seance) return NextResponse.json({ ok: false, erreur: "Séance introuvable." }, { status: 404 });
  }

  // Validation de l'image (PNG base64, taille raisonnable).
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(signature);
  if (!m) return NextResponse.json({ ok: false, erreur: "Signature invalide." }, { status: 400 });
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 200 || buf.length > 2_000_000) {
    return NextResponse.json({ ok: false, erreur: "Signature vide ou trop volumineuse." }, { status: 400 });
  }

  // Stockage de la signature.
  const path = `emargements/${seance.dossier_id}/${seance.id}_${role}.png`;
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, { contentType: "image/png", upsert: true });
  if (up.error) return NextResponse.json({ ok: false, erreur: "Stockage de la signature impossible." }, { status: 500 });

  const colonne = role === "stagiaire" ? "signature_stagiaire_url" : "signature_formatrice_url";
  const { data: maj, error } = await supabaseAdmin
    .from("planning").update({ [colonne]: path }).eq("id", seance.id)
    .select("emarge_le, heures_realisees").single();
  if (error) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 500 });

  const complet = !!(maj as any)?.emarge_le;
  // Demi-journée complète à l'instant : audit + rafraîchissement de la complétude du dossier.
  if (complet && !seance.emarge_le) {
    await journal("dossier", seance.dossier_id, "emargement_saisi", {
      seance_id: seance.id, date: seance.date_seance, demi_journee: seance.demi_journee,
    });
    try { await recomputeDossierStatus(seance.dossier_id); } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, role, complet });
}
