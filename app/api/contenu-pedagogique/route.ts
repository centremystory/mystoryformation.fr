/**
 * MYSTORY — /api/contenu-pedagogique  (bibliothèque interne de supports, par certif + niveau)
 * GET   ?certification=&niveau=&type=  → entrées actives + URL signée (1 h) par fichier.
 * POST  (multipart) : certification, niveau, type, titre, description?, fichier → upload bucket + ligne.
 * PATCH { id, action:"archiver" }  OU  { id, ...champs } → archive (le fichier reste) / met à jour.
 * Pas de suppression. Journalisé (auteur = session). Patron d'upload identique au justificatif FLE.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUCKET = "documents";
const MAX_SIZE = 25 * 1024 * 1024; // 25 Mo
const CERTIFS = ["tef_irn", "leveltel", "transverse"];
const NIVEAUX = ["tous", "A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES = ["programme", "support", "exercice", "evaluation", "autre"];
const MIME_OK = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg", "text/plain",
]);
const EXT_OK = new Set(["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "png", "jpg", "jpeg", "txt"]);

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  let q = supabaseAdmin
    .from("contenu_pedagogique")
    .select("id, certification, niveau, type, titre, description, fichier_path, fichier_nom, fichier_type, fichier_taille, auteur, cree_le")
    .eq("actif", true)
    .order("cree_le", { ascending: false });
  for (const [col, key] of [["certification", "certification"], ["niveau", "niveau"], ["type", "type"]] as const) {
    const v = sp.get(key);
    if (v) q = q.eq(col, v);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];
  const entrees = await Promise.all(rows.map(async (r) => {
    let url: string | null = null;
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(r.fichier_path, 3600);
    if (signed) url = signed.signedUrl;
    return { ...r, url };
  }));
  return NextResponse.json({ ok: true, entrees });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  try {
    const form = await req.formData();
    const certification = String(form.get("certification") ?? "transverse").trim();
    const niveau = String(form.get("niveau") ?? "tous").trim();
    const type = String(form.get("type") ?? "support").trim();
    const titre = String(form.get("titre") ?? "").trim();
    const description = String(form.get("description") ?? "").trim() || null;
    const file = form.get("fichier");

    if (!titre) return NextResponse.json({ ok: false, erreur: "Titre requis." }, { status: 400 });
    if (!CERTIFS.includes(certification)) return NextResponse.json({ ok: false, erreur: "Certification invalide." }, { status: 400 });
    if (!NIVEAUX.includes(niveau)) return NextResponse.json({ ok: false, erreur: "Niveau invalide." }, { status: 400 });
    if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, erreur: "Fichier requis." }, { status: 400 });

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!MIME_OK.has(file.type) && !EXT_OK.has(ext)) {
      return NextResponse.json({ ok: false, erreur: "Format non accepté (PDF, Word, PowerPoint, Excel, image, txt)." }, { status: 415 });
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (25 Mo maximum)." }, { status: 413 });

    const nomNettoye = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const chemin = `contenu-pedagogique/${crypto.randomUUID()}/${Date.now()}_${nomNettoye}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET)
      .upload(chemin, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return NextResponse.json({ ok: false, erreur: `Échec de l'envoi : ${upErr.message}` }, { status: 500 });

    const { data: ins, error: insErr } = await supabaseAdmin.from("contenu_pedagogique").insert({
      certification, niveau, type, titre, description,
      fichier_path: chemin, fichier_nom: file.name, fichier_type: file.type || null, fichier_taille: file.size,
      auteur: u.email ?? null,
    }).select("id").single();
    if (insErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([chemin]); // rollback : jamais de fichier orphelin
      return NextResponse.json({ ok: false, erreur: insErr.message }, { status: 500 });
    }
    await journal("contenu_pedagogique", (ins as any).id, "contenu_ajoute", { certification, niveau, type, titre }, u.email ?? null);
    return NextResponse.json({ ok: true, id: (ins as any).id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? "Erreur serveur." }, { status: 500 });
  }
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
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (String(b?.action ?? "") === "archiver") {
    const { error } = await supabaseAdmin.from("contenu_pedagogique").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("contenu_pedagogique", id, "contenu_archive", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = {};
  if (typeof b?.titre === "string" && b.titre.trim()) champs.titre = b.titre.trim();
  if (typeof b?.description === "string") champs.description = b.description.trim() || null;
  if (typeof b?.certification === "string" && CERTIFS.includes(b.certification)) champs.certification = b.certification;
  if (typeof b?.niveau === "string" && NIVEAUX.includes(b.niveau)) champs.niveau = b.niveau;
  if (typeof b?.type === "string" && TYPES.includes(b.type)) champs.type = b.type;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("contenu_pedagogique").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("contenu_pedagogique", id, "contenu_modifie", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
