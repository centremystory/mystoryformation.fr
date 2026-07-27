// app/api/mon-rapport/route.ts — Rapport hebdo PERSONNEL : grille par jour × créneau (matin/aprem)
// avec horaires personnalisables par salarié, + tâches faites de la semaine, + compte-rendu libre.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];

function ajouterJours(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function lundiCourant(): string {
  const auj = new Date();
  const jc = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(auj);
  const ajd = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(auj);
  const idx: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return ajouterJours(ajd, -((idx[jc] || 1) - 1));
}
async function monId(email?: string): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabaseAdmin.from("utilisateurs").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  let user; try { user = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  const lundi = lundiCourant();
  const id = await monId(user.email);
  const email = user.email ?? "";

  // Tâches faites / à faire (via l'assignation)
  let faites: any[] = [];
  if (id) {
    const { data } = await supabaseAdmin.from("taches")
      .select("id, titre, agence, temps_minutes, fait_le")
      .eq("assignee", id).eq("fait", true).eq("actif", true).gte("fait_le", lundi)
      .order("fait_le", { ascending: false }).limit(200);
    faites = data ?? [];
  }
  const totalMinutes = faites.reduce((s, t) => s + (Number(t.temps_minutes) || 0), 0);

  // Horaires perso
  const { data: u } = await supabaseAdmin.from("utilisateurs").select("horaire_matin, horaire_aprem").eq("email", email).maybeSingle();
  const horaires = { matin: u?.horaire_matin ?? "9h30-12h30", aprem: u?.horaire_aprem ?? "14h-17h" };

  // Grille de la semaine (lundi→vendredi) × créneaux
  const dates = JOURS_FR.map((_, i) => ajouterJours(lundi, i));
  const { data: rj } = await supabaseAdmin.from("rapports_jour")
    .select("jour, creneau, activite").eq("utilisateur_email", email).in("jour", dates);
  const parCle = new Map((rj ?? []).map((r: any) => [`${r.jour}|${r.creneau}`, r.activite ?? ""]));
  const jours = JOURS_FR.map((nom, i) => {
    const date = dates[i];
    return { nom, date, matin: parCle.get(`${date}|matin`) ?? "", aprem: parCle.get(`${date}|aprem`) ?? "" };
  });

  // Compte-rendu libre
  const { data: rap } = await supabaseAdmin.from("rapports_hebdo").select("contenu").eq("utilisateur_email", email).eq("semaine", lundi).maybeSingle();

  return NextResponse.json({ ok: true, semaine: lundi, identifie: !!id, faites, nbFaites: faites.length, totalMinutes, horaires, jours, contenu: rap?.contenu ?? "" });
}

export async function POST(req: NextRequest) {
  let user; try { user = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  const email = user.email;
  if (!email) return NextResponse.json({ ok: false, erreur: "Compte sans email." }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  // 1) Horaires perso
  if (typeof b.horaire_matin === "string" || typeof b.horaire_aprem === "string") {
    const maj: any = {};
    if (typeof b.horaire_matin === "string") maj.horaire_matin = String(b.horaire_matin).slice(0, 40);
    if (typeof b.horaire_aprem === "string") maj.horaire_aprem = String(b.horaire_aprem).slice(0, 40);
    await supabaseAdmin.from("utilisateurs").update(maj).eq("email", email);
  }

  // 2) Grille jour × créneau
  if (Array.isArray(b.jours)) {
    const lignes = b.jours
      .filter((j: any) => j && j.jour && (j.creneau === "matin" || j.creneau === "aprem"))
      .map((j: any) => ({ utilisateur_email: email, jour: String(j.jour).slice(0, 10), creneau: j.creneau, activite: String(j.activite ?? "").slice(0, 2000), maj_le: new Date().toISOString() }));
    if (lignes.length) {
      const { error } = await supabaseAdmin.from("rapports_jour").upsert(lignes, { onConflict: "utilisateur_email,jour,creneau" });
      if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    }
  }

  // 3) Compte-rendu libre (optionnel)
  if (typeof b.contenu === "string") {
    await supabaseAdmin.from("rapports_hebdo").upsert(
      { utilisateur_email: email, semaine: lundiCourant(), contenu: String(b.contenu).slice(0, 5000), maj_le: new Date().toISOString() },
      { onConflict: "utilisateur_email,semaine" });
  }

  return NextResponse.json({ ok: true });
}
