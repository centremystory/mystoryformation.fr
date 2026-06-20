/**
 * MYSTORY — GET /api/classement/global?periode=mois|tout
 * Classement vendeur calculé à la volée depuis le CRM : par vendeur (prénom),
 * CA et nombre de ventes, en 3 vues : Examen (ventes_examen), Formation (dossiers),
 * et Global (les deux combinés, fusionnés par prénom). Réservé à la Direction.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = { vendu_par: string | null; montant: number | null };

function agreger(rows: Row[]): Map<string, { libelle: string; ventes: number; ca: number }> {
  const m = new Map<string, { libelle: string; ventes: number; ca: number }>();
  for (const r of rows) {
    const libelle = (r.vendu_par ?? "").trim() || "(non attribué)";
    const cle = libelle.toLowerCase();
    const cur = m.get(cle) ?? { libelle, ventes: 0, ca: 0 };
    cur.ventes += 1;
    cur.ca += Number(r.montant ?? 0);
    m.set(cle, cur);
  }
  return m;
}

const triCa = (a: { ca: number }, b: { ca: number }) => b.ca - a.ca;

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["direction"]);
    const periode = req.nextUrl.searchParams.get("periode") === "mois" ? "mois" : "tout";
    let depuis: string | null = null;
    if (periode === "mois") {
      const d = new Date();
      depuis = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    }

    // Examen — exclut Annulé / Remboursé.
    let qe = supabaseAdmin.from("ventes_examen").select("vendu_par, montant, statut_paiement, created_at");
    if (depuis) qe = qe.gte("created_at", depuis);
    const { data: exAll, error: eEx } = await qe;
    if (eEx) return NextResponse.json({ ok: false, erreur: eEx.message }, { status: 500 });
    const ex = (exAll ?? []).filter((r: any) => !["Annulé", "Remboursé"].includes(r.statut_paiement));

    // Formation — exclut annulé / archivé.
    let qf = supabaseAdmin.from("dossiers").select("vendu_par, montant, statut, created_at");
    if (depuis) qf = qf.gte("created_at", depuis);
    const { data: foAll, error: eFo } = await qf;
    if (eFo) return NextResponse.json({ ok: false, erreur: eFo.message }, { status: 500 });
    const fo = (foAll ?? []).filter((r: any) => !["annule", "archive", "annulé", "archivé"].includes(String(r.statut ?? "").toLowerCase()));

    const mEx = agreger(ex);
    const mFo = agreger(fo);

    const examen = [...mEx.values()].map((v) => ({ vendeur: v.libelle, ventes: v.ventes, ca: v.ca })).sort(triCa);
    const formation = [...mFo.values()].map((v) => ({ vendeur: v.libelle, ventes: v.ventes, ca: v.ca })).sort(triCa);

    const cles = new Set<string>([...mEx.keys(), ...mFo.keys()]);
    const global = [...cles].map((cle) => {
      const e = mEx.get(cle); const f = mFo.get(cle);
      return {
        vendeur: e?.libelle ?? f?.libelle ?? cle,
        ventes: (e?.ventes ?? 0) + (f?.ventes ?? 0),
        ca: (e?.ca ?? 0) + (f?.ca ?? 0),
        ventesExamen: e?.ventes ?? 0, caExamen: e?.ca ?? 0,
        ventesFormation: f?.ventes ?? 0, caFormation: f?.ca ?? 0,
      };
    }).sort(triCa);

    const totaux = {
      examen: { ventes: examen.reduce((s, v) => s + v.ventes, 0), ca: examen.reduce((s, v) => s + v.ca, 0) },
      formation: { ventes: formation.reduce((s, v) => s + v.ventes, 0), ca: formation.reduce((s, v) => s + v.ca, 0) },
      global: { ventes: global.reduce((s, v) => s + v.ventes, 0), ca: global.reduce((s, v) => s + v.ca, 0) },
    };

    return NextResponse.json({ ok: true, periode, examen, formation, global, totaux });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non autorisé" }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    return NextResponse.json({ ok: false, erreur: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
