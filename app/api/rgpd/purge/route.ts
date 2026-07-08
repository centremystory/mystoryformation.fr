// app/api/rgpd/purge/route.ts — Purge RGPD post-rétention (direction uniquement)
// GET  : liste des candidats (stagiaires > 5 ans après le dernier dossier, prospects > 3 ans)
// POST : { type: "stagiaire" | "prospect", id } → anonymisation (garde-fous en base) +
//        suppression des fichiers du bucket privé pour les stagiaires (obligation RGPD ;
//        les lignes en base ne sont JAMAIS supprimées : identité remplacée, traçabilité conservée).
// Les factures ne sont pas touchées (conservation comptable 10 ans, snapshot du nom sur la facture).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { estDirection } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documents";

async function directionSeulement(req: NextRequest) {
  const user = await requireUser(req);
  if (!estDirection(user.role)) throw new UnauthorizedError("Réservé à la direction.");
  return user;
}

export async function GET(req: NextRequest) {
  try {
    await directionSeulement(req);
    const { data, error } = await supabaseAdmin.rpc("rgpd_candidats_purge");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ candidats: data ?? [] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await directionSeulement(req);
    const { type, id } = (await req.json()) as { type?: string; id?: string };
    if (!id || (type !== "stagiaire" && type !== "prospect")) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }
    const auteur = `direction:${user.email ?? user.id}`;

    if (type === "prospect") {
      const { error } = await supabaseAdmin.rpc("rgpd_anonymiser_prospect", { p_id: id, p_auteur: auteur });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, fichiers_supprimes: 0 });
    }

    // Stagiaire : anonymise en base (garde-fou rétention côté SQL) et récupère les chemins des PDF
    const { data: chemins, error } = await supabaseAdmin.rpc("rgpd_anonymiser_stagiaire", {
      p_stagiaire: id,
      p_auteur: auteur,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    let supprimes = 0;
    const liste = (chemins ?? []) as string[];
    if (liste.length > 0) {
      const rm = await supabaseAdmin.storage.from(BUCKET).remove(liste);
      if (!rm.error) supprimes = liste.length;
      // best-effort : un échec storage n'annule pas l'anonymisation (retraçable via journal)
    }
    return NextResponse.json({ ok: true, fichiers_supprimes: supprimes });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
