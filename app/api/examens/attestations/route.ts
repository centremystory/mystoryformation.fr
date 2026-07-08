// app/api/examens/attestations/route.ts — Dépôt et consultation des attestations d'examen (TEF IRN).
// POST  (multipart) : examen_ref + source + fichier → upload bucket privé `documents`
//        (chemin attestations-tef/<examen_ref>/…), horodatage serveur, remplacement = actif=false + nouvelle ligne.
// GET    (?examen_ref=&source=) : URL signée 1 h vers la dernière attestation active.
// Protégé par le middleware global (mot de passe d'équipe). Pas de DELETE (traçabilité).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const TYPES_ACCEPTES = ["application/pdf", "image/jpeg", "image/png"];

function tableSource(source: string): "examens" | "ventes_examen" | null {
  if (source === "import") return "examens";
  if (source === "vente") return "ventes_examen";
  return null;
}

/** GET : URL signée 1 h vers la dernière attestation active d'un candidat. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  const url = new URL(req.url);
  const examenRef = String(url.searchParams.get("examen_ref") ?? "").trim();
  const source = String(url.searchParams.get("source") ?? "").trim();
  if (!examenRef || !tableSource(source)) {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : examen_ref + source." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("attestations_tef")
    .select("fichier_url, fichier_nom, depose_le")
    .eq("examen_ref", examenRef)
    .eq("source", source)
    .eq("actif", true)
    .order("depose_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erreur: "Aucune attestation déposée." }, { status: 404 });

  const { data: signe, error: sErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(data.fichier_url, 3600);
  if (sErr || !signe) return NextResponse.json({ ok: false, erreur: sErr?.message ?? "Lien indisponible." }, { status: 500 });

  return NextResponse.json({ ok: true, url: signe.signedUrl, nom: data.fichier_nom, depose_le: data.depose_le });
}

/** POST : dépôt d'une attestation pour un candidat (examen_ref + source). */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  try {
    const form = await req.formData();
    const examenRef = String(form.get("examen_ref") ?? "").trim();
    const source = String(form.get("source") ?? "").trim();
    const file = form.get("fichier");

    const table = tableSource(source);
    if (!examenRef || !table || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, erreur: "Paramètres requis : examen_ref (uuid), source (import|vente) et fichier (PDF/JPG/PNG)." },
        { status: 400 }
      );
    }
    if (!TYPES_ACCEPTES.includes(file.type)) {
      return NextResponse.json({ ok: false, erreur: "Format non accepté — PDF, JPG ou PNG uniquement." }, { status: 415 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ ok: false, erreur: "Fichier trop volumineux (10 Mo maximum)." }, { status: 413 });
    }

    // Le candidat doit exister dans sa table d'origine — jamais d'attestation orpheline.
    const { data: candidat, error: candErr } = await supabaseAdmin
      .from(table)
      .select("id")
      .eq("id", examenRef)
      .maybeSingle();
    if (candErr || !candidat) {
      return NextResponse.json({ ok: false, erreur: "Candidat introuvable." }, { status: 404 });
    }

    const nomNettoye = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-80);
    const chemin = `attestations-tef/${examenRef}/${Date.now()}_${nomNettoye}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(chemin, bytes, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ ok: false, erreur: `Échec de l'envoi : ${upErr.message}` }, { status: 500 });
    }

    // Remplacement : on désactive les attestations actives précédentes (on ne supprime jamais).
    await supabaseAdmin
      .from("attestations_tef")
      .update({ actif: false })
      .eq("examen_ref", examenRef)
      .eq("source", source)
      .eq("actif", true);

    const { data: row, error: insErr } = await supabaseAdmin
      .from("attestations_tef")
      .insert({ examen_ref: examenRef, source, fichier_url: chemin, fichier_nom: nomNettoye }) // depose_le=now(), actif=true par défaut
      .select("fichier_nom, depose_le")
      .single();
    if (insErr) {
      // Rollback du fichier si l'enregistrement échoue.
      await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
      return NextResponse.json({ ok: false, erreur: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, attestation: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? "Erreur serveur." }, { status: 500 });
  }
}
