/**
 * MYSTORY — Client Supabase (service_role) pour les fonctions serveur Vercel.
 * Le service_role BYPASS la RLS → réservé au code serveur, JAMAIS exposé au navigateur.
 * Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * NB : on force `cache: "no-store"` sur le fetch sous-jacent. Sans ça, le Data Cache
 * de Next.js (App Router) mémorise les réponses PostgREST et renvoie des données
 * périmées sur les pages de lecture (ex. /suivi) malgré `dynamic = "force-dynamic"`.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Supabase non configuré : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
}

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: noStoreFetch },
});
