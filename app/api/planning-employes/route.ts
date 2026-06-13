/**
 * MYSTORY — /api/planning-employes  (planning de travail du staff — RH)
 * GET   ?employe=&site=&depuis=&jusqu=  → Direction/staff voient tout (+ liste employés pour le formulaire) ;
 *        un employé voit ses propres créneaux. Renvoie { peutGerer, creneaux, employes }.
 * POST  { utilisateurId, dateJour, heureDebut?, heureFin?, site, note? }  → affecte (Direction).
 * PATCH { id, action:"supprimer" } OU { id, ...champs }  → retire (actif=false) / met à jour (Direction).
 * Distinct de public.planning (séances stagiaires). Pas de suppression. Journalisé.
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
function heureValide(h: string): boolean {
  return /^\d{2}:\d{2}$/.test(h);
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
    .from("planning_employes")
    .select("id, utilisateur_id, date_jour, heure_debut, heure_fin, site, note, auteur, cree_le, utilisateurs(nom, prenom)")
    .eq("actif", true)
    .order("date_jour", { ascending: true })
    .order("heure_debut", { ascending: true });
  if (!gere) {
    if (!u.id) return NextResponse.json({ ok: true, peutGerer: false, creneaux: [], employes: [] });
    q = q.eq("utilisateur_id", u.id);
  } else {
    const emp = sp.get("employe"); if (emp) q = q.eq("utilisateur_id", emp);
    const site = sp.get("site"); if (site) q = q.eq("site", site);
  }
  const depuis = sp.get("depuis"); if (depuis && /^\d{4}-\d{2}-\d{2}$/.test(depuis)) q = q.gte("date_jour", depuis);
  const jusqu = sp.get("jusqu"); if (jusqu && /^\d{4}-\d{2}-\d{2}$/.test(jusqu)) q = q.lte("date_jour", jusqu);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  let employes: any[] = [];
  if (gere) {
    const { data: us } = await supabaseAdmin.from("utilisateurs").select("id, nom, prenom").eq("actif", true).order("nom", { ascending: true });
    employes = us ?? [];
  }
  return NextResponse.json({ ok: true, peutGerer: gere, creneaux: data ?? [], employes });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peutGerer(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const utilisateurId = String(b?.utilisateurId ?? "").trim();
  const dateJour = String(b?.dateJour ?? "").trim();
  const site = String(b?.site ?? "Gagny").trim();
  const note = String(b?.note ?? "").trim() || null;
  const heureDebut = String(b?.heureDebut ?? "").trim();
  const heureFin = String(b?.heureFin ?? "").trim();

  if (!utilisateurId) return NextResponse.json({ ok: false, erreur: "Employé requis." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateJour)) return NextResponse.json({ ok: false, erreur: "Date requise." }, { status: 400 });
  if (!SITES.includes(site)) return NextResponse.json({ ok: false, erreur: "Site invalide." }, { status: 400 });
  if (heureDebut && !heureValide(heureDebut)) return NextResponse.json({ ok: false, erreur: "Heure de début invalide." }, { status: 400 });
  if (heureFin && !heureValide(heureFin)) return NextResponse.json({ ok: false, erreur: "Heure de fin invalide." }, { status: 400 });
  if (heureDebut && heureFin && heureFin <= heureDebut) return NextResponse.json({ ok: false, erreur: "L'heure de fin doit être après le début." }, { status: 400 });

  const { data: util } = await supabaseAdmin.from("utilisateurs").select("id").eq("id", utilisateurId).single();
  if (!util) return NextResponse.json({ ok: false, erreur: "Employé introuvable." }, { status: 404 });

  const { data, error } = await supabaseAdmin.from("planning_employes").insert({
    utilisateur_id: utilisateurId, date_jour: dateJour, site, note,
    heure_debut: heureDebut || null, heure_fin: heureFin || null, auteur: u.email ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("planning_employes", (data as any).id, "creneau_ajoute", { utilisateurId, dateJour, site }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peutGerer(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (String(b?.action ?? "") === "supprimer") {
    const { error } = await supabaseAdmin.from("planning_employes").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("planning_employes", id, "creneau_retire", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = {};
  if (typeof b?.dateJour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dateJour)) champs.date_jour = b.dateJour;
  if (typeof b?.site === "string" && SITES.includes(b.site)) champs.site = b.site;
  if (typeof b?.note === "string") champs.note = b.note.trim() || null;
  if (typeof b?.heureDebut === "string") champs.heure_debut = b.heureDebut && heureValide(b.heureDebut) ? b.heureDebut : null;
  if (typeof b?.heureFin === "string") champs.heure_fin = b.heureFin && heureValide(b.heureFin) ? b.heureFin : null;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("planning_employes").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("planning_employes", id, "creneau_modifie", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
