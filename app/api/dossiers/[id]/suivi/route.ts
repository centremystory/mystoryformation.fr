// app/api/dossiers/[id]/suivi/route.ts — Suivi pédagogique d'un dossier (formatrices) :
// examens blancs (scores /699 par épreuve) + checklist jour J. Alimente le livret de suivi PDF.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CHECKLIST_JOUR_J } from "@/lib/suivi";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scoreOk = (v: any) => {
  if (v === "" || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 699 ? n : null;
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  const { data: bl } = await supabaseAdmin.from("examens_blancs")
    .select("id, numero, date_passage, ce, co, ee, eo, niveau_estime, remarque")
    .eq("dossier_id", params.id).order("numero");
  const { data: d } = await supabaseAdmin.from("dossiers").select("checklist_jour_j").eq("id", params.id).maybeSingle();
  return NextResponse.json({
    ok: true,
    examensBlancs: bl ?? [],
    checklist: (d?.checklist_jour_j ?? {}) as Record<string, boolean>,
    items: CHECKLIST_JOUR_J,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let u; try { u = await requireUser(req); } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false }, { status: 401 }); throw e;
  }
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  // 1) Examen blanc (upsert par numéro)
  if (b.examen_blanc) {
    const e = b.examen_blanc;
    const numero = parseInt(String(e.numero), 10);
    if (!(numero >= 1 && numero <= 6)) return NextResponse.json({ ok: false, erreur: "Numéro d'examen blanc invalide (1-6)." }, { status: 400 });
    const ligne = {
      dossier_id: params.id, numero,
      date_passage: e.date_passage || null,
      ce: scoreOk(e.ce), co: scoreOk(e.co), ee: scoreOk(e.ee), eo: scoreOk(e.eo),
      niveau_estime: e.niveau_estime ? String(e.niveau_estime).slice(0, 10) : null,
      remarque: e.remarque ? String(e.remarque).slice(0, 1000) : null,
      maj_le: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("examens_blancs").upsert(ligne, { onConflict: "dossier_id,numero" });
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("dossier", params.id, "examen_blanc_saisi", { numero }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  // 2) Checklist jour J (fusion)
  if (b.checklist && typeof b.checklist === "object") {
    const valides = new Set(CHECKLIST_JOUR_J.map((i) => i.cle));
    const propre: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(b.checklist)) if (valides.has(k)) propre[k] = !!v;
    const { error } = await supabaseAdmin.from("dossiers").update({ checklist_jour_j: propre }).eq("id", params.id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erreur: "Rien à enregistrer." }, { status: 400 });
}
