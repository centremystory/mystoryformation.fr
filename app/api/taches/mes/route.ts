// app/api/taches/mes/route.ts — Tâches À TRAITER pour l'utilisateur courant.
// = tâches actives non faites assignées À MOI (utilisateurs.id via email) OU à MON SITE (cookie).
// Sert au bandeau d'alerte urgente affiché sur toutes les pages.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const user = await requireUser(req);
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);

  // Résout mon id utilisateur (assignee = utilisateurs.id) via l'email de session.
  let monId: string | null = null;
  if (user.email) {
    const { data: u } = await supabaseAdmin.from("utilisateurs").select("id").eq("email", user.email).maybeSingle();
    monId = u?.id ?? null;
  }

  const ors: string[] = [];
  if (monId) ors.push(`assignee.eq.${monId}`);
  if (site) ors.push(`agence.eq.${site}`);
  if (!ors.length) return NextResponse.json({ ok: true, taches: [], total: 0, urgentes: 0 });

  const { data, error } = await supabaseAdmin
    .from("taches")
    .select("id, agence, titre, echeance, assignee, cree_le")
    .eq("actif", true).eq("fait", false)
    .or(ors.join(","))
    .order("echeance", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const auj = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const taches = (data ?? []).map((t: any) => ({ ...t, mienne: t.assignee === monId, urgente: !t.echeance || t.echeance <= auj }));
  return NextResponse.json({
    ok: true,
    taches,
    total: taches.length,
    urgentes: taches.filter((t: any) => t.urgente).length,
  });
}
