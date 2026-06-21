/**
 * MYSTORY — Suivi pédagogique par cours (fiche de suivi de l'élève).
 * GET   ?dossier=<id> : liste des entrées actives d'un dossier.
 * POST                : ajoute une entrée (contenu fait, points forts/faibles, satisfaction).
 * PATCH               : archive une entrée (actif=false ; jamais de DELETE).
 * Horodatage serveur now(). Date de cours jamais dans le futur (anti-antidatage). Auth obligatoire.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

const COLS = "id, numero_cours, date_cours, contenu_fait, points_forts, points_faibles, satisfaction, auteur, cree_le";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const dossier = (req.nextUrl.searchParams.get("dossier") ?? "").trim();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Paramètre dossier requis." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("suivi_cours")
    .select(COLS)
    .eq("dossier_id", dossier)
    .eq("actif", true)
    .order("numero_cours", { ascending: true, nullsFirst: false })
    .order("date_cours", { ascending: true, nullsFirst: false })
    .order("cree_le", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cours: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const body = await req.json().catch(() => ({}));
  const dossier_id = String(body.dossier_id ?? "").trim();
  if (!dossier_id) return NextResponse.json({ ok: false, erreur: "Dossier manquant." }, { status: 400 });

  let numero_cours: number | null = null;
  if (body.numero_cours != null && String(body.numero_cours).trim() !== "") {
    const n = parseInt(String(body.numero_cours), 10);
    if (!Number.isFinite(n) || n < 1) return NextResponse.json({ ok: false, erreur: "Numéro de cours invalide." }, { status: 400 });
    numero_cours = n;
  }

  let date_cours: string | null = null;
  if (body.date_cours != null && String(body.date_cours).trim() !== "") {
    const d = String(body.date_cours).trim();
    if (d > aujourdhuiParis()) return NextResponse.json({ ok: false, erreur: "La date du cours ne peut pas être dans le futur." }, { status: 400 });
    date_cours = d;
  }

  let satisfaction: number | null = null;
  if (body.satisfaction != null && String(body.satisfaction).trim() !== "") {
    const s = parseInt(String(body.satisfaction), 10);
    if (!Number.isFinite(s) || s < 1 || s > 5) return NextResponse.json({ ok: false, erreur: "Satisfaction invalide (1 à 5)." }, { status: 400 });
    satisfaction = s;
  }

  const contenu_fait = (body.contenu_fait ?? "").toString().trim() || null;
  const points_forts = (body.points_forts ?? "").toString().trim() || null;
  const points_faibles = (body.points_faibles ?? "").toString().trim() || null;

  if (!contenu_fait && !points_forts && !points_faibles && satisfaction == null) {
    return NextResponse.json({ ok: false, erreur: "Renseignez au moins un champ (contenu, points forts/faibles ou satisfaction)." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("suivi_cours")
    .insert({ dossier_id, numero_cours, date_cours, contenu_fait, points_forts, points_faibles, satisfaction, auteur: u.email ?? null })
    .select(COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("suivi_cours", (data as any)?.id ?? dossier_id, "suivi_cours_ajoute", { dossier_id, numero_cours }, u.email ?? null);
  return NextResponse.json({ ok: true, entree: data });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "Entrée manquante." }, { status: 400 });

  const { error } = await supabaseAdmin.from("suivi_cours").update({ actif: false }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("suivi_cours", id, "suivi_cours_archive", {}, u.email ?? null);
  return NextResponse.json({ ok: true });
}
