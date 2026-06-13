/**
 * MYSTORY — /api/pointage  (pointage entrée/sortie — RH, lié au compte connecté)
 * GET   ?employe=&depuis=&jusqu=  → Direction/staff voient tout ; un employé voit ses pointages.
 *        Renvoie { peutGerer, pointages, sessionOuverte } (sessionOuverte = entrée en cours de l'utilisateur).
 * POST  { action:"entree"|"sortie", site? }  → pointe ; horodatage TOUJOURS côté serveur (anti-antidate).
 * Une seule session ouverte par employé (garde-fou base). Pas de suppression. Journalisé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITES = ["Gagny", "Sarcelles", "Rosny", "Télétravail", "Autre"];
function peutGerer(role?: string): boolean {
  return !role || role === "staff" || role === "direction";
}
function jourParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const gere = peutGerer(u.role);
  const sp = req.nextUrl.searchParams;
  let q = supabaseAdmin
    .from("pointages")
    .select("id, utilisateur_id, jour, entree_le, sortie_le, site, auteur, utilisateurs(nom, prenom)")
    .order("entree_le", { ascending: false })
    .limit(200);
  if (!gere) {
    if (!u.id) return NextResponse.json({ ok: true, peutGerer: false, pointages: [], sessionOuverte: null });
    q = q.eq("utilisateur_id", u.id);
  } else {
    const emp = sp.get("employe"); if (emp) q = q.eq("utilisateur_id", emp);
  }
  const depuis = sp.get("depuis"); if (depuis && /^\d{4}-\d{2}-\d{2}$/.test(depuis)) q = q.gte("jour", depuis);
  const jusqu = sp.get("jusqu"); if (jusqu && /^\d{4}-\d{2}-\d{2}$/.test(jusqu)) q = q.lte("jour", jusqu);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Session ouverte de l'utilisateur connecté (pour savoir quel bouton afficher).
  let sessionOuverte: any = null;
  if (u.id) {
    const { data: open } = await supabaseAdmin
      .from("pointages").select("id, entree_le, site").eq("utilisateur_id", u.id).is("sortie_le", null).maybeSingle();
    sessionOuverte = open ?? null;
  }
  return NextResponse.json({ ok: true, peutGerer: gere, pointages: data ?? [], sessionOuverte });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!u.id) return NextResponse.json({ ok: false, erreur: "Connecte-toi avec ton compte individuel pour pointer." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const action = String(b?.action ?? "").trim();
  const site = String(b?.site ?? "").trim();
  if (site && !SITES.includes(site)) return NextResponse.json({ ok: false, erreur: "Site invalide." }, { status: 400 });

  if (action === "entree") {
    // Garde-fou : pas deux entrées ouvertes (l'index unique partiel double cette vérif).
    const { data: open } = await supabaseAdmin.from("pointages").select("id").eq("utilisateur_id", u.id).is("sortie_le", null).maybeSingle();
    if (open) return NextResponse.json({ ok: false, erreur: "Tu as déjà une entrée en cours — pointe ta sortie d'abord." }, { status: 409 });
    const { data, error } = await supabaseAdmin.from("pointages")
      .insert({ utilisateur_id: u.id, jour: jourParis(), site: site || null, auteur: u.email ?? null })
      .select("id, entree_le").single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("pointages", (data as any).id, "pointage_entree", { site: site || null }, u.email ?? null);
    return NextResponse.json({ ok: true, pointage: data });
  }

  if (action === "sortie") {
    const { data: open } = await supabaseAdmin.from("pointages").select("id").eq("utilisateur_id", u.id).is("sortie_le", null).maybeSingle();
    if (!open) return NextResponse.json({ ok: false, erreur: "Aucune entrée en cours." }, { status: 409 });
    const { error } = await supabaseAdmin.from("pointages").update({ sortie_le: new Date().toISOString() }).eq("id", (open as any).id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("pointages", (open as any).id, "pointage_sortie", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erreur: "Action inconnue (entree|sortie)." }, { status: 400 });
}
