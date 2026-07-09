// app/api/formateurs/[id]/route.ts — Fiche formateur individuelle (lecture)
// L'écriture passe par le PATCH existant de /api/formateurs (whitelist + journal).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); }
  catch (e) { return NextResponse.json({ erreur: e instanceof UnauthorizedError ? e.message : "Non autorisé" }, { status: 401 }); }

  const { data, error } = await supabaseAdmin
    .from("formateurs")
    .select("id, civilite, prenom, nom, email, telephone, type, raison_sociale, siret, adresse, token, cree_le, actif, formatrice_id, formatrice:formatrice_id (id, nom, prenom, justificatif_fle), formateur_documents(id, type, statut, sign_url, signe_le, fichier_signe_path), formateur_questionnaire(id, horodatage, reponses)")
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ erreur: "Formateur introuvable" }, { status: 404 });
  return NextResponse.json({ formateur: data });
}
