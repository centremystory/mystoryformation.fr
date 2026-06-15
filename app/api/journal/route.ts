/**
 * MYSTORY — /api/journal  (consultation du journal d'audit — qui fait quoi)
 * GET (Direction) ?recherche=&entite=&auteur=&jours=&offset= → entrées du journal + filtres disponibles.
 * Lecture seule. Réservé à la Direction (action sensible comptes_gerer ; la session équipe passe).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { peut } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 60;

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peut(u.role, "comptes_gerer")) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const entite = sp.get("entite") ?? "";
  const auteur = sp.get("auteur") ?? "";
  const jours = parseInt(sp.get("jours") ?? "0", 10);
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10));
  const recherche = (sp.get("recherche") ?? "").trim().replace(/[%,()*]/g, " ").trim();

  let q = supabaseAdmin
    .from("journal")
    .select("id, horodatage, auteur, entite, entite_id, evenement, ancienne_valeur, nouvelle_valeur")
    .order("horodatage", { ascending: false })
    .range(offset, offset + LIMITE - 1);

  if (entite) q = q.eq("entite", entite);
  if (auteur === "__sans__") q = q.is("auteur", null);
  else if (auteur) q = q.eq("auteur", auteur);
  if (jours > 0) q = q.gte("horodatage", new Date(Date.now() - jours * 86400000).toISOString());
  if (recherche.length >= 2) q = q.or(`evenement.ilike.%${recherche}%,entite.ilike.%${recherche}%,entite_id.ilike.%${recherche}%,auteur.ilike.%${recherche}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Valeurs distinctes pour les filtres (journal de taille modeste).
  const { data: refs } = await supabaseAdmin.from("journal").select("entite, auteur").limit(2000);
  const entites = [...new Set((refs ?? []).map((r: any) => r.entite).filter(Boolean))].sort();
  const auteurs = [...new Set((refs ?? []).map((r: any) => r.auteur).filter(Boolean))].sort();

  return NextResponse.json({
    ok: true, entrees: data ?? [], entites, auteurs,
    page: { offset, limite: LIMITE, suite: (data ?? []).length === LIMITE },
  });
}
