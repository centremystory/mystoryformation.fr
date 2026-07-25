// app/api/mon-rapport/route.ts — Rapport hebdo PERSONNEL du salarié connecté.
// GET  : tâches faites cette semaine (+ temps passé via taches.temps_minutes), tâches à faire,
//        + le compte-rendu libre sauvegardé (rapports_hebdo).
// POST : sauvegarde le compte-rendu libre de la semaine (upsert par email + lundi).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE } from "@/lib/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const site = siteValide(req.cookies.get(COOKIE_SITE)?.value);

  let faites: any[] = [];
  if (id) {
    const { data } = await supabaseAdmin.from("taches")
      .select("id, titre, agence, temps_minutes, fait_le")
      .eq("assignee", id).eq("fait", true).eq("actif", true).gte("fait_le", lundi)
      .order("fait_le", { ascending: false }).limit(200);
    faites = data ?? [];
  }
  let aFaire: any[] = [];
  const ors: string[] = [];
  if (id) ors.push(`assignee.eq.${id}`);
  if (site) ors.push(`agence.eq.${site}`);
  if (ors.length) {
    const { data } = await supabaseAdmin.from("taches")
      .select("id, titre, agence, echeance")
      .eq("actif", true).eq("fait", false).or(ors.join(","))
      .order("echeance", { ascending: true, nullsFirst: true }).limit(50);
    aFaire = data ?? [];
  }
  const totalMinutes = faites.reduce((s, t) => s + (Number(t.temps_minutes) || 0), 0);
  const { data: rap } = await supabaseAdmin.from("rapports_hebdo")
    .select("contenu").eq("utilisateur_email", user.email ?? "").eq("semaine", lundi).maybeSingle();

  return NextResponse.json({ ok: true, semaine: lundi, identifie: !!id, faites, aFaire, nbFaites: faites.length, totalMinutes, contenu: rap?.contenu ?? "" });
}

export async function POST(req: NextRequest) {
  let user; try { user = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  if (!user.email) return NextResponse.json({ ok: false, erreur: "Compte sans email." }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const contenu = String(b?.contenu ?? "").slice(0, 5000);
  const { error } = await supabaseAdmin.from("rapports_hebdo")
    .upsert({ utilisateur_email: user.email, semaine: lundiCourant(), contenu, maj_le: new Date().toISOString() }, { onConflict: "utilisateur_email,semaine" });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
