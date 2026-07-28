// lib/permissions.ts — Résolution des permissions de pages (défauts code + overrides DB).
// Node uniquement (supabaseAdmin). Le middleware Edge lit la map via /api/permissions/public.
import { supabaseAdmin } from "./supabaseAdmin";
import { effectivePageRoles, type Role } from "./roles";

/** Overrides bruts stockés en base (page_cle → rôles autorisés). */
export async function lireOverrides(): Promise<Record<string, string[]>> {
  const { data } = await supabaseAdmin.from("permissions_pages").select("page_cle, roles");
  const o: Record<string, string[]> = {};
  for (const r of (data ?? []) as any[]) if (Array.isArray(r.roles)) o[r.page_cle] = r.roles;
  return o;
}

/** Map effective (défauts fusionnés avec les overrides, tighten-only + Direction inamovible). */
export async function mapEffective(): Promise<Record<string, Role[]>> {
  return effectivePageRoles(await lireOverrides());
}
