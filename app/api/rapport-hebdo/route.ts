/**
 * MYSTORY — Rapport hebdomadaire (remplace le pointage).
 *  GET ?semaine=YYYY-MM-DD&employe= : lignes d'activité de la semaine (manuelles)
 *      + tâches clôturées de la semaine (collées automatiquement, en lecture).
 *  POST { semaine, activite, duree_minutes } : ajoute une ligne (pour soi).
 *  PATCH { id, action:"archive" } : archive une ligne (jamais DELETE).
 * Chacun voit/édite SON rapport ; Direction/Manager peuvent consulter via ?employe=.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rolesDe(u: { role?: string; roles?: string[] }): string[] {
  return (u.roles && u.roles.length > 0) ? u.roles : (u.role ? [u.role] : []);
}
function estEncadrement(u: { role?: string; roles?: string[] }): boolean {
  const rs = rolesDe(u);
  return rs.length === 0 || rs.includes("staff") || rs.includes("direction") || rs.includes("manager");
}

/** Bornes de la semaine (lundi → dimanche) contenant la date donnée (défaut : aujourd'hui). */
function bornesSemaine(dateStr: string | null): { lundi: string; dimanche: string } {
  const base = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  const j = base.getDay(); // 0=dim … 6=sam
  const diff = j === 0 ? -6 : 1 - j;
  const lundi = new Date(base); lundi.setDate(base.getDate() + diff);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { lundi: iso(lundi), dimanche: iso(dimanche) };
}

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const url = new URL(req.url);
    const { lundi, dimanche } = bornesSemaine(url.searchParams.get("semaine"));
    const encadre = estEncadrement(u);
    const employe = url.searchParams.get("employe");
    const cibleId = (employe && encadre) ? employe : u.id;

    // Lignes manuelles de la semaine
    const { data: lignes } = await supabaseAdmin
      .from("rapports_hebdo")
      .select("id, activite, duree_minutes, cree_le, utilisateur_id")
      .eq("utilisateur_id", cibleId).eq("semaine", lundi).eq("actif", true)
      .order("cree_le", { ascending: true });

    // Tâches clôturées dans la semaine (collées automatiquement)
    const { data: taches } = await supabaseAdmin
      .from("taches")
      .select("id, titre, agence, temps_minutes, fait_le")
      .eq("assignee", cibleId).eq("fait", true).eq("actif", true)
      .gte("fait_le", `${lundi}T00:00:00`).lte("fait_le", `${dimanche}T23:59:59`)
      .order("fait_le", { ascending: true });

    // Liste des employés (encadrement uniquement) pour le sélecteur
    let employes: any[] = [];
    if (encadre) {
      const { data } = await supabaseAdmin
        .from("utilisateurs").select("id, nom, prenom").eq("actif", true).order("nom");
      employes = data ?? [];
    }

    return NextResponse.json({
      ok: true, semaine: lundi, dimanche, cibleId, estEncadrement: encadre,
      lignes: lignes ?? [], taches: taches ?? [], employes,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(() => ({}));
    const { lundi } = bornesSemaine(String(b?.semaine ?? "") || null);
    const activite = String(b?.activite ?? "").trim();
    const duree = Math.max(0, Math.round(Number(b?.duree_minutes ?? 0)));
    if (!activite) return NextResponse.json({ ok: false, erreur: "Activité requise." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("rapports_hebdo")
      .insert({ utilisateur_id: u.id, semaine: lundi, activite, duree_minutes: Number.isFinite(duree) ? duree : 0, auteur: u.email ?? null })
      .select("id, activite, duree_minutes, cree_le, utilisateur_id").single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ligne: data });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const b = await req.json().catch(() => ({}));
    const id = String(b?.id ?? "").trim();
    if (!id || b?.action !== "archive") return NextResponse.json({ ok: false, erreur: "id + action:archive requis." }, { status: 400 });

    let q = supabaseAdmin.from("rapports_hebdo").update({ actif: false }).eq("id", id);
    if (!estEncadrement(u)) q = q.eq("utilisateur_id", u.id); // chacun n'archive que le sien
    const { error } = await q;
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}
