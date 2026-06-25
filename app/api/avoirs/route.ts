/**
 * MYSTORY — /api/avoirs  ·  Avoirs (notes de crédit) contre une facture.
 * GET  ?facture_id= → avoirs d'une facture (+ URL signée PDF) · sans param → registre (200 derniers).
 * POST { facture_id, montant, motif } → émet un avoir (numéro AV-YYYY-NNNNN via trigger), PDF archivé.
 * Pas de DELETE (document comptable). Restriction : action « facturation ».
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSignedUrl } from "@/lib/crm";
import { genererAvoirPdf } from "@/lib/avoir";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}
const peutFacturer = (u: SessionUser) => !u.role || peut(u.roles ?? u.role, "facturation");
const refus = () => NextResponse.json({ ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." }, { status: 403 });

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const factureId = String(req.nextUrl.searchParams.get("facture_id") ?? "").trim();

  let q = supabaseAdmin.from("avoirs")
    .select("id, numero, facture_id, montant, motif, client, designation, serie, pdf_path, cree_par, cree_le")
    .eq("actif", true).order("cree_le", { ascending: false });
  if (factureId) q = q.eq("facture_id", factureId); else q = q.limit(200);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const avoirs = await Promise.all((data ?? []).map(async (a: any) => ({
    ...a, pdf_url: a.pdf_path ? await getSignedUrl(a.pdf_path, 3600).catch(() => null) : null,
  })));
  return NextResponse.json({ ok: true, avoirs });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutFacturer(g)) return refus();

  const b = await req.json().catch(() => ({}));
  const factureId = String(b?.facture_id ?? "").trim();
  const montant = Number(b?.montant);
  const motif = String(b?.motif ?? "").trim();
  if (!factureId) return NextResponse.json({ ok: false, erreur: "Facture requise." }, { status: 400 });
  if (!(montant > 0)) return NextResponse.json({ ok: false, erreur: "Montant requis (> 0)." }, { status: 400 });
  if (!motif) return NextResponse.json({ ok: false, erreur: "Motif obligatoire." }, { status: 400 });

  // Facture + net restant (le trigger revalide, mais on donne une erreur claire ici).
  const { data: f } = await supabaseAdmin.from("factures")
    .select("id, numero, montant, client, designation, serie").eq("id", factureId).maybeSingle();
  if (!f) return NextResponse.json({ ok: false, erreur: "Facture introuvable." }, { status: 404 });
  const { data: dejaAvoirs } = await supabaseAdmin.from("avoirs").select("montant").eq("facture_id", factureId).eq("actif", true);
  const net = Number((f as any).montant ?? 0) - (dejaAvoirs ?? []).reduce((s, a: any) => s + Number(a.montant ?? 0), 0);
  if (montant > net + 0.001) {
    return NextResponse.json({ ok: false, erreur: `Montant supérieur au net restant de la facture (${net.toFixed(2)} €).` }, { status: 400 });
  }

  // Insertion : le trigger attribue le numéro (AV-YYYY-NNNNN) et fixe cree_le = now().
  const { data: avoir, error } = await supabaseAdmin.from("avoirs")
    .insert({
      facture_id: factureId, montant, motif,
      client: (f as any).client, designation: (f as any).designation, serie: (f as any).serie,
      cree_par: g.email ?? null,
    })
    .select("id, numero, montant").single();
  if (error || !avoir) return NextResponse.json({ ok: false, erreur: error?.message ?? "Création impossible." }, { status: 500 });

  const numero = (avoir as any).numero as string;

  // PDF + archivage (best effort : si le rendu échoue, l'avoir reste valide en base).
  let pdf_path: string | null = null;
  try {
    const pdf = await genererAvoirPdf({
      numero, facture_numero: (f as any).numero, client: (f as any).client,
      designation: (f as any).designation, montant, motif, serie: (f as any).serie,
    });
    pdf_path = `avoirs/${numero}.pdf`;
    const up = await supabaseAdmin.storage.from(BUCKET).upload(pdf_path, pdf, { contentType: "application/pdf", upsert: true });
    if (up.error) throw up.error;
    await supabaseAdmin.from("avoirs").update({ pdf_path }).eq("id", (avoir as any).id);
  } catch (e: any) {
    pdf_path = null; // l'avoir existe ; le PDF pourra être régénéré
  }

  await journal("avoirs", (avoir as any).id, "emis", { numero, facture: (f as any).numero, montant, motif }, g.email ?? null);

  return NextResponse.json({ ok: true, numero, montant, net_apres: net - montant, pdf_ok: !!pdf_path });
}
