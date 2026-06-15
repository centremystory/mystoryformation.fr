/**
 * MYSTORY — POST /api/bpf/sous-traitance  (saisie d'une ligne de sous-traitance, auth)
 * Body : { sens, prestataire, annee, montant, facture_ref?, contrat_ref?, attestation? }
 * Pas de suppression (traçabilité Qualiopi) — on ajoute, on ne détruit pas.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const prestataire = String(b?.prestataire ?? "").trim();
  const annee = Number(b?.annee);
  const montant = Number(b?.montant);
  const sens = b?.sens === "recue" ? "recue" : "confiee";
  if (!prestataire || !Number.isInteger(annee) || !(montant >= 0)) {
    return NextResponse.json({ ok: false, erreur: "Prestataire, année et montant valides requis." }, { status: 400 });
  }
  const ligne = {
    sens, prestataire, annee, montant,
    facture_ref: b?.facture_ref ? String(b.facture_ref) : null,
    contrat_ref: b?.contrat_ref ? String(b.contrat_ref) : null,
    attestation_anti_demarchage: !!b?.attestation,
    note: b?.note ? String(b.note) : null,
  };
  const { data, error } = await supabaseAdmin.from("sous_traitance").insert(ligne).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("sous_traitance", (data as any).id, "ajout", { prestataire, annee, montant, sens }, u?.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}
