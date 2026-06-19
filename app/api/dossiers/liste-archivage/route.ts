/**
 * MYSTORY — GET /api/dossiers/liste-archivage
 * Renvoie la liste des dossiers stagiaires à sauvegarder (id + identité), pour l'archivage
 * quotidien sur le Drive (n8n récupère ensuite le ZIP de chacun via /api/dossiers/export-zip).
 * Lecture seule. Auth obligatoire (le Bearer JWT de n8n passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "stagiaire";
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, certif, statut, created_at, stagiaires ( nom, prenom, agence )")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // On n'archive QUE les dossiers ayant au moins une pièce archivée (sinon export-zip répond 409).
  const { data: arch } = await supabaseAdmin.from("archives").select("dossier_id");
  const avecPieces = new Set((arch ?? []).map((a: any) => a.dossier_id));

  const dossiers = (data ?? []).filter((d: any) => avecPieces.has(d.id)).map((d: any) => {
    const nom = d.stagiaires?.nom ?? "";
    const prenom = d.stagiaires?.prenom ?? "";
    return {
      id: d.id,
      nom, prenom,
      agence: d.stagiaires?.agence ?? null,
      certif: d.certif ?? null,
      statut: d.statut ?? null,
      // nom de fichier ZIP suggéré (n8n peut l'utiliser tel quel)
      fichier: `${slug(nom)}_${slug(prenom)}_${d.id}.zip`,
      dossierDrive: `${slug(nom)}_${slug(prenom)}`,
    };
  });

  return NextResponse.json({ ok: true, total: dossiers.length, dossiers });
}
