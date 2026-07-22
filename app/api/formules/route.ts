/**
 * MYSTORY — /api/formules  (catalogue des formules & tarifs)
 * GET    : liste des formules (lecture équipe).
 * POST   : créer une formule (Direction / Manager).
 * PATCH  : modifier une formule (prix, heures, remise, actif…) (Direction / Manager).
 * DELETE : supprimer une formule (Direction / Manager).
 *
 * Rappel conformité : la grille CPF est la source de vérité du contrôle tarifaire CDC (lib/gates.ts).
 * Les grilles « personnel » (fonds propres) / « opco » autorisent des remises (prix libre).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, requireRole, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_ADMIN = ["direction", "manager"] as const;
const FINANCEMENTS = ["cpf", "personnel", "opco"];

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Accès non autorisé." }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  const { data, error } = await supabaseAdmin
    .from("formules")
    .select("id, certif, financement, heures, prix_eur, remise_pct, libelle, frais_examen_inclus, actif, ordre")
    .order("financement").order("ordre").order("heures");
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, formules: data ?? [] });
}

function parseBody(body: any) {
  const certif = String(body?.certif ?? "TEF_IRN").trim();
  const financement = String(body?.financement ?? "cpf").trim().toLowerCase();
  const heures = Number(body?.heures);
  const prix_eur = Number(body?.prix_eur);
  const remise_pct = body?.remise_pct == null ? 0 : Number(body.remise_pct);
  const frais_examen_inclus = body?.frais_examen_inclus !== false;
  const actif = body?.actif !== false;
  const ordre = body?.ordre == null ? 0 : Number(body.ordre);
  const libelle = String(body?.libelle ?? "").trim()
    || `${heures} h — ${prix_eur} €${frais_examen_inclus ? " (frais d'examen inclus)" : ""}`;
  return { certif, financement, heures, prix_eur, remise_pct, frais_examen_inclus, actif, ordre, libelle };
}

function valider(f: ReturnType<typeof parseBody>): string | null {
  if (!FINANCEMENTS.includes(f.financement)) return "Financement invalide (cpf / personnel / opco).";
  if (!(f.heures > 0)) return "Durée (heures) invalide.";
  if (!(f.prix_eur >= 0)) return "Prix invalide.";
  if (!(f.remise_pct >= 0 && f.remise_pct <= 100)) return "Remise invalide (0 à 100 %).";
  return null;
}

export async function POST(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const f = parseBody(body);
  const err = valider(f); if (err) return NextResponse.json({ ok: false, erreur: err }, { status: 422 });
  const { data, error } = await supabaseAdmin.from("formules").insert(f).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const f = parseBody(body);
  const err = valider(f); if (err) return NextResponse.json({ ok: false, erreur: err }, { status: 422 });
  const { error } = await supabaseAdmin.from("formules").update(f).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  try { await requireRole(req, ROLES_ADMIN); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  const { error } = await supabaseAdmin.from("formules").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
