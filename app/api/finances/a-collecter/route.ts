/**
 * MYSTORY — /api/finances/a-collecter (argent à récupérer, source Supabase)
 * GET → impayés examen (reste_a_payer_eur > 0) + reste-à-charge CPF non réglé (dossiers).
 * Auth : session OU token de service Bearer (patron /api/incidents). Pour le Brief Cash.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const items: { qui: string; montant: number; type: string }[] = [];

  // 1 — Impayés examen (reste à payer > 0, hors remboursés/annulés)
  const { data: ex } = await supabaseAdmin.from("examens")
    .select("nom,prenom,reste_a_payer_eur,statut_reglement")
    .eq("actif", true).gt("reste_a_payer_eur", 0);
  for (const r of ex ?? []) {
    const x = r as any;
    if (/rembours|annul/i.test(String(x.statut_reglement || ""))) continue;
    items.push({ qui: `${x.nom || ""} ${x.prenom || ""}`.trim(), montant: Number(x.reste_a_payer_eur) || 0, type: "examen" });
  }

  // 2 — Reste-à-charge CPF non réglé (dossiers, hors exemptés/annulés)
  const { data: dos } = await supabaseAdmin.from("dossiers")
    .select("reste_a_charge_accepte,participation_forfaitaire_reglee,participation_forfaitaire_exemptee,statut,stagiaires(nom,prenom)")
    .neq("statut", "annule");
  for (const d of dos ?? []) {
    const x = d as any;
    const nonRegle = x.participation_forfaitaire_reglee !== true && x.participation_forfaitaire_exemptee !== true;
    const reste = Number(x.reste_a_charge_accepte) || 0;
    if (nonRegle && reste > 0) {
      const s = x.stagiaires || {};
      items.push({ qui: `${s.nom || ""} ${s.prenom || ""}`.trim() || "(stagiaire)", montant: reste, type: "reste-à-charge CPF" });
    }
  }

  items.sort((a, b) => b.montant - a.montant);
  const total = items.reduce((s, r) => s + r.montant, 0);
  return NextResponse.json({ ok: true, nb: items.length, total, top: items.slice(0, 6) });
}
