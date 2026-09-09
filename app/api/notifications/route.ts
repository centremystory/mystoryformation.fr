/**
 * MYSTORY — Pastilles de non-lu des fils internes.
 *
 * GET   → le nombre d'elements plus recents que la derniere lecture, par fil.
 * PATCH → marque un fil comme lu jusqu'a maintenant.
 *
 * 10/09/2026 — sans ces pastilles, un message d'equipe n'est jamais lu : rien ne
 * signale qu'il existe. C'est le point qui decide de l'usage reel du CRM par
 * l'equipe a partir du 14/09.
 *
 * Le compte se fait par comparaison de dates, sans stocker une ligne par message et
 * par lecteur : inutile a cette echelle, et cela evite une table qui grossit sans fin.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILS = ["equipe", "prospects", "questions"] as const;
type Fil = (typeof FILS)[number];

// Ce qu'on compte, fil par fil. On exclut toujours ses PROPRES messages : personne
// n'a besoin d'une pastille pour ce qu'il vient d'ecrire.
async function compter(fil: Fil, depuis: string, email: string | null): Promise<number> {
  if (fil === "equipe") {
    let q = supabaseAdmin.from("messages_equipe")
      .select("id", { count: "exact", head: true })
      .eq("actif", true).gt("cree_le", depuis);
    if (email) q = q.or(`auteur_email.is.null,auteur_email.neq.${email}`);
    const { count } = await q;
    return count ?? 0;
  }
  if (fil === "prospects") {
    // Un prospect « nouveau » est non traite : c'est lui qui merite l'attention,
    // pas le simple fait qu'un message soit recent.
    const { count } = await supabaseAdmin.from("messages_prospects")
      .select("id", { count: "exact", head: true })
      .eq("statut", "nouveau").gt("cree_le", depuis);
    return count ?? 0;
  }
  // questions : les questions ouvertes, et les reponses aux fils existants
  let q = supabaseAdmin.from("questions_internes")
    .select("id", { count: "exact", head: true })
    .eq("archive", false).gt("cree_le", depuis);
  if (email) q = q.or(`auteur_email.is.null,auteur_email.neq.${email}`);
  const { count } = await q;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  let u;
  try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    throw e;
  }

  const { data: lectures } = await supabaseAdmin
    .from("lectures_fils").select("fil, lu_jusqu_a").eq("utilisateur_id", u.id);
  const vu = new Map((lectures ?? []).map((l: any) => [l.fil, l.lu_jusqu_a]));

  // Jamais ouvert : on ne remonte pas a la creation du CRM, sinon la pastille
  // affiche des centaines d'elements le premier jour et personne ne la regarde.
  const plancher = new Date(Date.now() - 30 * 86400000).toISOString();

  const compte: Record<string, number> = {};
  await Promise.all(FILS.map(async (f) => {
    compte[f] = await compter(f, vu.get(f) ?? plancher, u.email ?? null);
  }));

  return NextResponse.json({
    ok: true, compte,
    total: Object.values(compte).reduce((a, b) => a + b, 0),
  });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    throw e;
  }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const fil = String(b?.fil ?? "");
  if (!FILS.includes(fil as Fil)) {
    return NextResponse.json({ ok: false, erreur: "Fil inconnu." }, { status: 400 });
  }
  const maintenant = new Date().toISOString();
  const { error } = await supabaseAdmin.from("lectures_fils")
    .upsert({ utilisateur_id: u.id, fil, lu_jusqu_a: maintenant, maj_le: maintenant },
            { onConflict: "utilisateur_id,fil" });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
