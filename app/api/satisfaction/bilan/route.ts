/**
 * MYSTORY — GET /api/satisfaction/bilan?type=chaud|froid&depuis=YYYY-MM-DD&jusqu=YYYY-MM-DD
 * Agrège les réponses de satisfaction (exploitation des retours — exigence Qualiopi) :
 * moyenne par critère, % de satisfaits, NPS (recommandation), nombre de répondants, verbatims.
 * Lecture seule, réservé à l'équipe (requireUser).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRITERES: Record<string, { cle: string; label: string }[]> = {
  chaud: [
    { cle: "q_info", label: "Information avant la formation" },
    { cle: "q_conditions", label: "Conditions matérielles & accueil" },
    { cle: "q_pedago", label: "Qualité pédagogique" },
    { cle: "q_rythme", label: "Rythme & progression" },
    { cle: "q_projet", label: "Réponse au projet & aux attentes" },
  ],
  froid: [
    { cle: "q_objectif", label: "Atteinte de l'objectif" },
    { cle: "q_usage", label: "Usage du français au quotidien" },
    { cle: "q_besoins", label: "Réponse aux besoins" },
  ],
};

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "froid" ? "froid" : "chaud";
    const depuis = url.searchParams.get("depuis");
    const jusqu = url.searchParams.get("jusqu");

    let q = supabaseAdmin.from("satisfactions").select("reponses, horodatage").eq("type", type);
    if (depuis) q = q.gte("horodatage", `${depuis}T00:00:00`);
    if (jusqu) q = q.lte("horodatage", `${jusqu}T23:59:59`);
    const { data, error } = await q.order("horodatage", { ascending: false });
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

    const lignes = (data ?? []) as { reponses: any; horodatage: string }[];
    const n = lignes.length;

    // Moyenne + % satisfaits (note ≥ 4) par critère
    const criteres = CRITERES[type].map(({ cle, label }) => {
      const vals = lignes.map((l) => Number(l.reponses?.[cle])).filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
      const somme = vals.reduce((s, v) => s + v, 0);
      const moyenne = vals.length ? somme / vals.length : null;
      const satisfaits = vals.filter((v) => v >= 4).length;
      const pctSatisfaits = vals.length ? Math.round((satisfaits / vals.length) * 100) : null;
      return { cle, label, moyenne, pctSatisfaits, n: vals.length };
    });

    // NPS (question « recommanderiez-vous », 0–10)
    const nps10 = lignes.map((l) => Number(l.reponses?.nps)).filter((v) => Number.isFinite(v) && v >= 0 && v <= 10);
    const promoteurs = nps10.filter((v) => v >= 9).length;
    const detracteurs = nps10.filter((v) => v <= 6).length;
    const nps = nps10.length ? Math.round(((promoteurs - detracteurs) / nps10.length) * 100) : null;

    // Satisfaction globale = moyenne des moyennes de critères disponibles
    const moyennes = criteres.map((c) => c.moyenne).filter((m): m is number => m != null);
    const globaleSur5 = moyennes.length ? moyennes.reduce((s, v) => s + v, 0) / moyennes.length : null;

    // Verbatims (commentaires non vides)
    const verbatims = lignes
      .map((l) => ({ texte: String(l.reponses?.commentaire ?? "").trim(), date: l.horodatage }))
      .filter((v) => v.texte.length > 0)
      .slice(0, 100);

    return NextResponse.json({
      ok: true, type, n,
      nps, npsRepondants: nps10.length,
      globaleSur5,
      criteres, verbatims,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}
