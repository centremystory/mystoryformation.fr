/**
 * MYSTORY — /api/positionnement/[token]  (PUBLIC par jeton : notation formatrice)
 *  GET  : charge le positionnement (identité + CE/CO) pour l'écran de notation.
 *  POST : enregistre EE + EO (0-10) → calcule le niveau → statut "complet"
 *         (le pont A3 crée alors le stagiaire + le dossier).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT =
  "id, certif, civilite, nom, prenom, email, telephone, niveau_vise, ce_sur20, co_sur10, ee_sur10, eo_sur10, total_sur20, niveau_global, remarques, statut, dossier_id, created_at, oral_audios, ecrit";

function niveauFromSur20(n: number): string {
  if (n <= 4) return "A0";
  if (n <= 9) return "A1";
  if (n <= 14) return "A2";
  if (n <= 18) return "B1";
  return "B2";
}
function num(v: unknown, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > max) return null;
  return n;
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin.from("positionnements").select(SELECT).eq("token", params.token).maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!data) return NextResponse.json({ ok: false, erreur: "Positionnement introuvable." }, { status: 404 });

  // Audios de l'oral : URLs signées (bucket privé) pour écoute par la formatrice.
  const audios = Array.isArray((data as any).oral_audios) ? (data as any).oral_audios : [];
  const oral: Array<{ q: number; question: string; url: string | null; duree: number | null }> = [];
  for (const a of audios) {
    let url: string | null = null;
    try {
      const { data: signed } = await supabaseAdmin.storage.from("documents").createSignedUrl((a as any).chemin, 3600);
      url = signed?.signedUrl ?? null;
    } catch { /* lien indisponible : on renvoie null, l'UI le signale */ }
    oral.push({ q: (a as any).q ?? 0, question: (a as any).question ?? "", url, duree: (a as any).duree ?? null });
  }
  const { oral_audios, ...reste } = data as any;
  return NextResponse.json({ ok: true, positionnement: { ...reste, oral } });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const ee = num(b.ee_sur10, 10), eo = num(b.eo_sur10, 10);
  if (ee == null || eo == null) return NextResponse.json({ ok: false, erreur: "Notes EE et EO requises (0 à 10)." }, { status: 422 });
  const remarques = b.remarques == null ? null : (String(b.remarques).trim().slice(0, 4000) || null);

  const { data: cur, error: e1 } = await supabaseAdmin
    .from("positionnements").select("id, ce_sur20, co_sur10, statut").eq("token", params.token).maybeSingle();
  if (e1) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!cur) return NextResponse.json({ ok: false, erreur: "Positionnement introuvable." }, { status: 404 });
  if (cur.ce_sur20 == null || cur.co_sur10 == null)
    return NextResponse.json({ ok: false, erreur: "Notes CE/CO absentes : niveau incalculable." }, { status: 409 });

  const tot40 = Number(cur.ce_sur20) / 2 + Number(cur.co_sur10) + ee + eo;
  const tot20 = Math.round((tot40 / 2) * 10) / 10;
  const niveau = niveauFromSur20(tot20);

  const { data: upd, error: e2 } = await supabaseAdmin.from("positionnements").update({
    ee_sur10: ee, eo_sur10: eo, remarques, total_sur20: tot20, niveau_global: niveau, statut: "complet",
  }).eq("token", params.token).select("id, niveau_global, total_sur20, statut, dossier_id").single();
  if (e2 || !upd) return NextResponse.json({ ok: false, erreur: "Mise à jour impossible." }, { status: 502 });

  return NextResponse.json({
    ok: true, niveau_global: upd.niveau_global, total_sur20: upd.total_sur20,
    statut: upd.statut, dossier_cree: !!upd.dossier_id,
  });
}

/**
 * PUT — Oral asynchrone (PUBLIC par jeton). Le candidat envoie ses enregistrements audio
 * (3 questions fixes) juste après le QCM. Stockés dans le bucket privé `documents`,
 * chemins consignés dans `positionnements.oral_audios`. Aucune note ici : la formatrice
 * écoute et attribue l'EO lors de la notation.
 */
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const audios = Array.isArray(b.audios) ? b.audios : null;
  if (!audios || audios.length === 0) return NextResponse.json({ ok: false, erreur: "Aucun enregistrement." }, { status: 422 });
  if (audios.length > 3) return NextResponse.json({ ok: false, erreur: "3 enregistrements maximum." }, { status: 422 });

  const { data: pos } = await supabaseAdmin.from("positionnements").select("id").eq("token", params.token).maybeSingle();
  if (!pos) return NextResponse.json({ ok: false, erreur: "Positionnement introuvable." }, { status: 404 });
  const id = (pos as any).id;

  const stockes: Array<{ q: number; question: string; chemin: string; duree: number | null }> = [];
  for (let i = 0; i < audios.length; i++) {
    const a = audios[i] as any;
    const b64 = String(a?.audioBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!b64) continue;
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 6 * 1024 * 1024) return NextResponse.json({ ok: false, erreur: "Enregistrement trop volumineux (max ~6 Mo)." }, { status: 413 });
    const q = Number.isFinite(Number(a?.q)) ? Number(a.q) : i;
    const chemin = `oral/${id}/q${q}.webm`;
    const { error: up } = await supabaseAdmin.storage.from("documents").upload(chemin, buf, { contentType: "audio/webm", upsert: true });
    if (up) return NextResponse.json({ ok: false, erreur: `Téléversement impossible : ${up.message}` }, { status: 502 });
    stockes.push({ q, question: String(a?.question ?? "").slice(0, 300), chemin, duree: a?.duree != null ? Number(a.duree) : null });
  }
  if (stockes.length === 0) return NextResponse.json({ ok: false, erreur: "Enregistrements vides." }, { status: 422 });

  const { error } = await supabaseAdmin.from("positionnements").update({ oral_audios: stockes }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });
  return NextResponse.json({ ok: true, nombre: stockes.length });
}
