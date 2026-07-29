// app/api/mon-rapport/route.ts — « Mon rapport et mes tâches » (page unique).
// Le rapport = des ENTRÉES d'activité avec le TEMPS réalisé (pas du texte libre) et
// l'heure de saisie (cree_le, anti-triche), rangées par jour × créneau (matin/aprem).
// GET agrège : entrées de la semaine + tâches faites (assignées) + tâches à faire (à moi)
//              + horaires perso. POST ajoute/supprime une entrée.
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

export async function GET(req: NextRequest) {
  let user; try { user = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  const email = user.email ?? "";
  const id = user.id ?? null;
  const lundi = lundiCourant();
  const dimanche = ajouterJours(lundi, 6);
  const dates = JOURS_FR.map((_, i) => ajouterJours(lundi, i));

  // Entrées d'activité de la semaine (temps réalisé + heure de saisie), par jour/créneau.
  let entrees: any[] = [];
  if (id) {
    const { data } = await supabaseAdmin.from("rapports_hebdo")
      .select("id, jour, creneau, activite, duree_minutes, cree_le")
      .eq("utilisateur_id", id).eq("actif", true).not("jour", "is", null)
      .gte("jour", lundi).lte("jour", dimanche)
      .order("cree_le", { ascending: true });
    entrees = data ?? [];
  }

  // Tâches ASSIGNÉES faites cette semaine (comptent aussi dans le rapport).
  let tachesFaites: any[] = [];
  if (id) {
    const { data } = await supabaseAdmin.from("taches")
      .select("id, titre, agence, temps_minutes, fait_le")
      .eq("assignee", id).eq("fait", true).eq("actif", true)
      .gte("fait_le", `${lundi}T00:00:00`).lte("fait_le", `${dimanche}T23:59:59`)
      .order("fait_le", { ascending: true });
    tachesFaites = data ?? [];
  }

  // Mes tâches À FAIRE (assignées à moi, non faites).
  let mesTaches: any[] = [];
  if (id) {
    const { data } = await supabaseAdmin.from("taches")
      .select("id, titre, agence, echeance, cree_le")
      .eq("assignee", id).eq("fait", false).eq("actif", true)
      .order("echeance", { ascending: true, nullsFirst: false }).limit(100);
    mesTaches = data ?? [];
  }

  const totalMinutes =
    entrees.reduce((s, e) => s + (Number(e.duree_minutes) || 0), 0) +
    tachesFaites.reduce((s, t) => s + (Number(t.temps_minutes) || 0), 0);

  // Horaires perso (contexte matin/après-midi).
  const { data: u } = await supabaseAdmin.from("utilisateurs")
    .select("horaire_matin, horaire_aprem").eq("email", email).maybeSingle();
  const horaires = { matin: u?.horaire_matin ?? "9h30-12h30", aprem: u?.horaire_aprem ?? "14h-17h" };

  return NextResponse.json({
    ok: true, identifie: !!id, semaine: lundi,
    jours: JOURS_FR.map((nom, i) => ({ nom, date: dates[i] })),
    entrees, tachesFaites, mesTaches, totalMinutes, horaires,
  });
}

export async function POST(req: NextRequest) {
  let user; try { user = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  if (!user.id) return NextResponse.json({ ok: false, erreur: "Connecte-toi avec ton compte individuel." }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  // Horaires perso (facultatif).
  if (typeof b.horaire_matin === "string" || typeof b.horaire_aprem === "string") {
    const maj: any = {};
    if (typeof b.horaire_matin === "string") maj.horaire_matin = String(b.horaire_matin).slice(0, 40);
    if (typeof b.horaire_aprem === "string") maj.horaire_aprem = String(b.horaire_aprem).slice(0, 40);
    if (Object.keys(maj).length && user.email) await supabaseAdmin.from("utilisateurs").update(maj).eq("email", user.email);
    return NextResponse.json({ ok: true });
  }

  const action = String(b.action ?? "ajouter");

  if (action === "supprimer") {
    const id = String(b.id ?? "").trim();
    if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
    const { error } = await supabaseAdmin.from("rapports_hebdo").update({ actif: false })
      .eq("id", id).eq("utilisateur_id", user.id); // chacun ne supprime que le sien
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Ajouter une entrée : tâche faite AVEC le temps réalisé (l'heure de saisie fait foi).
  const jour = String(b.jour ?? "").slice(0, 10);
  const creneau = b.creneau === "aprem" ? "aprem" : b.creneau === "matin" ? "matin" : null;
  const activite = String(b.activite ?? "").trim();
  const duree = Math.max(0, Math.round(Number(b.duree_minutes ?? 0)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return NextResponse.json({ ok: false, erreur: "Jour invalide." }, { status: 422 });
  if (!creneau) return NextResponse.json({ ok: false, erreur: "Créneau requis (matin/aprem)." }, { status: 422 });
  if (!activite) return NextResponse.json({ ok: false, erreur: "Décris la tâche réalisée." }, { status: 400 });
  if (!Number.isFinite(duree) || duree <= 0) return NextResponse.json({ ok: false, erreur: "Indique le temps passé (minutes)." }, { status: 422 });

  const { data, error } = await supabaseAdmin.from("rapports_hebdo").insert({
    utilisateur_id: user.id, utilisateur_email: user.email ?? null, semaine: lundiCourant(),
    jour, creneau, activite: activite.slice(0, 500), duree_minutes: duree, auteur: user.email ?? null,
  }).select("id, jour, creneau, activite, duree_minutes, cree_le").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entree: data });
}
