// lib/catalogue.ts — Helpers du catalogue v4 (offres_formules) partagés entre routes.
import { supabaseAdmin } from "./supabaseAdmin";

/** Snapshot du catalogue complet AVANT modification → point de retour arrière. */
export async function snapshotCatalogue(auteur: string | undefined | null, motif: string) {
  const { data } = await supabaseAdmin.from("offres_formules").select("*").order("offre_id").order("ordre");
  await supabaseAdmin.from("offres_formules_versions").insert({ auteur: auteur ?? null, motif, snapshot: data ?? [] });
}
