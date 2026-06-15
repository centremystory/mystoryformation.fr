/**
 * MYSTORY — Incidents techniques (Tier 4). Journalise les échecs (emails, n8n, système)
 * pour qu'ils soient VISIBLES (page /incidents + compteur accueil) au lieu d'être silencieux.
 * Ne lève jamais : ne doit jamais casser l'appelant.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function consignerIncident(
  source: "email" | "n8n" | "systeme",
  titre: string,
  detail?: string | null,
  contexte?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await supabaseAdmin.from("incidents_techniques").insert({
      source, titre, detail: detail ?? null, contexte: contexte ?? null,
    });
  } catch { /* silencieux : la journalisation ne doit jamais faire échouer l'action */ }
}
