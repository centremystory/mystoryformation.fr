/**
 * MYSTORY — POST /api/partenaire/[token]/depot : dépôt d'un document par le partenaire.
 * type = emargement | facture | justificatif. Multipart (fichier) + montant/periode (facture).
 * Horodatage serveur (anti-antidate). Statut 'soumis' → validation interne ultérieure. Pas de DELETE.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverPartenaire } from "@/lib/partenaire";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documents";
const TYPES = ["emargement", "facture", "justificatif"];
const MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await resolverPartenaire(params.token);
  if (!p) return NextResponse.json({ ok: false, erreur: "Lien invalide ou expiré." }, { status: 404 });

  const form = await req.formData();
  const type = String(form.get("type") ?? "").trim();
  const file = form.get("fichier");
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type de dépôt invalide." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, erreur: "Fichier requis." }, { status: 400 });
  if (!MIME.includes(file.type)) return NextResponse.json({ ok: false, erreur: "Format : PDF, JPG ou PNG." }, { status: 415 });
  if (file.size > MAX) return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (10 Mo max)." }, { status: 413 });

  const montant = type === "facture" && form.get("montant") ? Number(form.get("montant")) : null;
  const periode = form.get("periode") ? String(form.get("periode")).trim() || null : null;
  if (type === "facture" && (montant == null || isNaN(montant) || montant <= 0)) {
    return NextResponse.json({ ok: false, erreur: "Montant de la facture requis." }, { status: 400 });
  }

  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
  const chemin = `partenaire/${p.id}/${type}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(chemin, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ ok: false, erreur: upErr.message }, { status: 500 });

  const { data, error } = await supabaseAdmin.from("partenaire_depots")
    .insert({ formateur_id: p.id, type, fichier_path: chemin, fichier_nom: (file as File).name || `${type}.${ext}`, montant, periode })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("partenaire_depot", String((data as any).id), "partenaire_depot", { formateur_id: p.id, type, montant, periode }, `partenaire:${p.nom}`);
  return NextResponse.json({ ok: true, id: (data as any).id });
}
