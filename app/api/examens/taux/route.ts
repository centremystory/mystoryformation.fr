/**
 * MYSTORY — /api/examens/taux  (indicateur de résultats Qualiopi)
 * Taux de présentation = présents / résultats saisis ; taux de réussite = réussis / présents.
 * TEF IRN : réussite = présent + niveau obtenu (répartition A1→B2). Civique : Réussi/Échoué/Absent.
 * Couvre l'historique (examens, source 'import') ET les ventes (ventes_examen).
 * Filtres : ?certif=TEF_IRN|CIVIQUE|tous & agence & debut=AAAA-MM-JJ & fin=AAAA-MM-JJ
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIVEAUX_TEF = ["A1", "A2", "B1", "B2"];

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  const certif = sp.get("certif") || "tous";
  const agence = sp.get("agence") || "toutes";
  const debut = sp.get("debut") || null;
  const fin = sp.get("fin") || null;

  const { data: cands, error } = await supabaseAdmin
    .from("v_candidats_examen")
    .select("id, source, type_norm, agence, date_examen");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const { data: resultats } = await supabaseAdmin
    .from("resultats_examen").select("vente_id, examen_ref, source, statut, niveau_obtenu");
  const parVente = new Map<string, any>();
  const parImport = new Map<string, any>();
  for (const r of (resultats ?? []) as any[]) {
    if (r.vente_id) parVente.set(r.vente_id, r);
    if (r.examen_ref && r.source === "import") parImport.set(r.examen_ref, r);
  }

  const filtres = (c: any) => {
    if (certif !== "tous" && c.type_norm !== certif) return false;
    if (agence !== "toutes" && (c.agence ?? "") !== agence) return false;
    if (debut && (!c.date_examen || c.date_examen < debut)) return false;
    if (fin && (!c.date_examen || c.date_examen > fin)) return false;
    return true;
  };

  function agreger(items: any[]) {
    let inscrits = 0, saisis = 0, presents = 0, absents = 0, reussis = 0, echoues = 0;
    const niveaux: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0 };
    for (const c of items) {
      inscrits++;
      const r = c.source === "vente" ? parVente.get(c.id) : parImport.get(c.id);
      if (!r?.statut) continue;
      saisis++;
      if (r.statut === "Absent") { absents++; continue; }
      presents++;
      if (r.statut === "Réussi") {
        reussis++;
        if (r.niveau_obtenu && niveaux[r.niveau_obtenu] != null) niveaux[r.niveau_obtenu]++;
      } else if (r.statut === "Échoué") {
        echoues++;
      }
    }
    const tauxPresentation = saisis ? Math.round((presents / saisis) * 100) : null;
    const tauxReussite = presents ? Math.round((reussis / presents) * 100) : null;
    return { inscrits, saisis, presents, absents, reussis, echoues, sansResultat: inscrits - saisis, tauxPresentation, tauxReussite, niveaux };
  }

  const base = (cands ?? []).filter(filtres);
  const global = agreger(base);
  const parType = {
    TEF_IRN: agreger(base.filter((c: any) => c.type_norm === "TEF_IRN")),
    CIVIQUE: agreger(base.filter((c: any) => c.type_norm === "CIVIQUE")),
  };
  const agencesSet = Array.from(new Set((cands ?? []).map((c: any) => c.agence).filter(Boolean))).sort();
  const parAgence = agencesSet.map((ag: any) => ({ agence: ag, ...agreger(base.filter((c: any) => (c.agence ?? "") === ag)) }));

  return NextResponse.json({
    ok: true,
    filtres: { certif, agence, debut, fin },
    agences: agencesSet,
    global,
    parType,
    parAgence,
    niveauxTef: NIVEAUX_TEF,
  });
}
