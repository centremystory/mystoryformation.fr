/**
 * MYSTORY — POST /api/planning/absence
 * Marque (ou annule) l'absence d'un élève à une séance.
 * Garde-fous :
 *  - séance déjà émargée / signature en cours = présence prouvée → absence interdite ;
 *  - séance dans le futur = pas encore passée → absence interdite ;
 *  - horodatage serveur ; réversible (correction) sans suppression de ligne.
 * Body : { id: string, absent: boolean, motif?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const absent = body?.absent === true;
  const motif = body?.motif != null ? String(body.motif).trim().slice(0, 500) : null;
  if (!id) return NextResponse.json({ ok: false, erreur: "Identifiant de séance requis." }, { status: 400 });

  const { data: seance, error: e1 } = await supabaseAdmin
    .from("planning")
    .select("id, date_seance, emarge_le, signature_stagiaire_url, signature_formatrice_url")
    .eq("id", id)
    .maybeSingle();
  if (e1) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 500 });
  if (!seance) return NextResponse.json({ ok: false, erreur: "Séance introuvable." }, { status: 404 });

  if (absent) {
    if (seance.emarge_le || seance.signature_stagiaire_url || seance.signature_formatrice_url)
      return NextResponse.json({ ok: false, erreur: "Séance émargée (présence signée) : impossible de la marquer absente." }, { status: 409 });
    const aujourdHuiParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    if (seance.date_seance >= aujourdHuiParis)
      return NextResponse.json({ ok: false, erreur: "Séance pas encore passée : l'absence ne peut être constatée qu'après la séance." }, { status: 409 });
  }

  const patch = absent
    ? { absence: true, absence_motif: motif, absence_le: new Date().toISOString() }
    : { absence: false, absence_motif: null, absence_le: null };

  const { error: e2 } = await supabaseAdmin.from("planning").update(patch).eq("id", id);
  if (e2) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
