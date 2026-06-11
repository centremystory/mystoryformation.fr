// app/api/equipe/justificatif/route.ts — Dépôt du justificatif FLE d'un formateur
// Upload navigateur → bucket privé `documents` (chemin justificatifs-fle/<id>/…),
// puis passage de la fiche en ✅ avec `justificatif_date` = date du jour CÔTÉ SERVEUR
// (anti-antidate : personne ne peut saisir une autre date).
// Protégé par le middleware global (mot de passe d'équipe).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "documents";
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo
const TYPES_ACCEPTES = ["application/pdf", "image/jpeg", "image/png"];

/** Date du jour au fuseau Europe/Paris, format YYYY-MM-DD (fr-CA = ISO). */
function aujourdHuiParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const id = String(form.get("id") ?? "").trim();
    const file = form.get("fichier");

    if (!id || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, erreur: "Paramètres requis : id (uuid) et fichier (PDF/JPG/PNG)." },
        { status: 400 }
      );
    }
    if (!TYPES_ACCEPTES.includes(file.type)) {
      return NextResponse.json(
        { ok: false, erreur: "Format non accepté — PDF, JPG ou PNG uniquement." },
        { status: 415 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { ok: false, erreur: "Fichier trop volumineux (10 Mo maximum)." },
        { status: 413 }
      );
    }

    // La fiche doit exister — on ne crée jamais une pièce orpheline.
    const { data: fiche, error: ficheErr } = await supabaseAdmin
      .from("formatrices")
      .select("id, nom, prenom")
      .eq("id", id)
      .single();
    if (ficheErr || !fiche) {
      return NextResponse.json({ ok: false, erreur: "Formateur introuvable." }, { status: 404 });
    }

    // Chemin Storage : justificatifs-fle/<id>/<timestamp>_<nom-de-fichier-nettoyé>
    const nomNettoye = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-80);
    const chemin = `justificatifs-fle/${id}/${Date.now()}_${nomNettoye}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(chemin, bytes, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ ok: false, erreur: `Échec de l'envoi : ${upErr.message}` }, { status: 500 });
    }

    // Passage en ✅ — satisfait la contrainte chk_fle_justifie côté base.
    const { data: maj, error: majErr } = await supabaseAdmin
      .from("formatrices")
      .update({
        justificatif_fle: true,
        justificatif_url: chemin, // chemin dans le bucket privé → URL signée à la lecture
        justificatif_date: aujourdHuiParis(),
      })
      .eq("id", id)
      .select()
      .single();
    if (majErr) {
      // Rollback du fichier si la mise à jour échoue — jamais de pièce orpheline.
      await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
      return NextResponse.json({ ok: false, erreur: majErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, formatrice: maj });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? "Erreur serveur." }, { status: 500 });
  }
}
