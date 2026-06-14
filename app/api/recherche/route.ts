/**
 * MYSTORY — /api/recherche?q=  (Tier 3 — recherche globale)
 * Cherche par nom/prénom/email dans : stagiaires (→ dossiers), formateurs, formatrices.
 * Réservé à l'équipe (requireUser). Min 2 caractères.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, stagiaires: [], formateurs: [], formatrices: [] });

  // Neutralise les caractères spéciaux du filtre PostgREST (virgule = séparateur de .or()).
  const safe = q.replace(/[%,()*]/g, " ").trim();
  const pat = `%${safe}%`;
  const nomComplet = (p?: string | null, n?: string | null) => [p, n].filter(Boolean).join(" ");

  const [st, fo, fm] = await Promise.all([
    supabaseAdmin.from("stagiaires").select("id, nom, prenom, email, agence")
      .or(`nom.ilike.${pat},prenom.ilike.${pat},email.ilike.${pat}`).limit(12),
    supabaseAdmin.from("formateurs").select("id, nom, prenom, email, type").eq("actif", true)
      .or(`nom.ilike.${pat},prenom.ilike.${pat},email.ilike.${pat}`).limit(12),
    supabaseAdmin.from("formatrices").select("id, nom, prenom").eq("actif", true)
      .or(`nom.ilike.${pat},prenom.ilike.${pat}`).limit(12),
  ]);

  return NextResponse.json({
    ok: true,
    stagiaires: (st.data ?? []).map((s: any) => ({
      id: s.id, label: nomComplet(s.prenom, s.nom), sous: s.email, agence: s.agence,
      href: `/dossiers?q=${encodeURIComponent(s.nom ?? "")}`,
    })),
    formateurs: (fo.data ?? []).map((f: any) => ({
      id: f.id, label: nomComplet(f.prenom, f.nom), sous: f.email,
      type: f.type, href: "/formateurs",
    })),
    formatrices: (fm.data ?? []).map((f: any) => ({
      id: f.id, label: nomComplet(f.prenom, f.nom), href: "/equipe",
    })),
  });
}
