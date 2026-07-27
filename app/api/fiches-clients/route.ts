// app/api/fiches-clients/route.ts — Liste des fiches clients, séparée Formation / Examen.
// ?type=formation → stagiaires (→ /fiche/[id]). ?type=examen → candidats (v_candidats_examen).
// ?q= filtre nom/prénom/email. Filtré par site (cookie) si présent. Lecture seule.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const nettoie = (s: any) => String(s ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "examen" ? "examen" : "formation";
  const q = nettoie(url.searchParams.get("q"));
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);

  if (type === "formation") {
    let query = supabaseAdmin.from("stagiaires").select("id, nom, prenom, email, telephone, agence").eq("actif", true);
    if (site) query = query.eq("agence", site);
    if (q) query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,email.ilike.%${q}%`);
    const { data, error } = await query.order("nom").limit(200);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    const fiches = (data ?? []).map((s: any) => ({
      id: s.id, nom: `${s.prenom ?? ""} ${s.nom ?? ""}`.trim() || "(sans nom)",
      email: s.email, telephone: s.telephone, agence: s.agence,
      meta: null, href: `/fiche/${s.id}`,
    }));
    return NextResponse.json({ ok: true, type, fiches, total: fiches.length });
  }

  // Examen
  let query = supabaseAdmin.from("v_candidats_examen").select("id, nom, prenom, email, telephone, agence, type_norm, date_examen, candidat_id, statut_paiement");
  if (site) query = query.eq("agence", site);
  if (q) query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await query.order("date_examen", { ascending: false, nullsFirst: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const fiches = (data ?? []).map((c: any) => ({
    id: c.id, nom: `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "(sans nom)",
    email: c.email, telephone: c.telephone, agence: c.agence,
    meta: `${c.type_norm ?? "examen"}${c.date_examen ? " · " + new Date(c.date_examen).toLocaleDateString("fr-FR") : ""}${c.statut_paiement ? " · " + c.statut_paiement : ""}`,
    href: c.candidat_id ? `/fiche/${c.candidat_id}` : null,
  }));
  return NextResponse.json({ ok: true, type, fiches, total: fiches.length });
}
