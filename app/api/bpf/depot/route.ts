/**
 * MYSTORY — POST /api/bpf/depot  (enregistre/corrige les chiffres du BPF officiellement déposé, auth)
 * Sert de référence pour la réconciliation CRM ↔ déposé. Upsert par année (clé primaire = annee).
 * Horodatage serveur + journal (traçabilité). Pas de suppression.
 * Body : { annee, cerfa?, total_produits?, cpf?, entreprises?, plan_autres?, autres_of?,
 *          autres_produits?, part_ca_pct?, charges_total?, salaires_formateurs?, achats_prestations? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  let u: SessionUser;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (u.role && !peut(u.role, "bpf_saisir")) return NextResponse.json({ ok: false, erreur: "Action réservée à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const annee = Number(b?.annee);
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100)
    return NextResponse.json({ ok: false, erreur: "Année invalide." }, { status: 400 });

  // Au moins le total de produits doit être renseigné pour servir de référence.
  const total = num(b?.total_produits);
  if (total == null)
    return NextResponse.json({ ok: false, erreur: "Le total des produits déposés est requis." }, { status: 400 });

  const ligne = {
    annee,
    cerfa: b?.cerfa ? String(b.cerfa).trim().slice(0, 40) : null,
    total_produits: total,
    cpf: num(b?.cpf),
    entreprises: num(b?.entreprises),
    plan_autres: num(b?.plan_autres),
    autres_of: num(b?.autres_of),
    autres_produits: num(b?.autres_produits),
    part_ca_pct: num(b?.part_ca_pct),
    charges_total: num(b?.charges_total),
    salaires_formateurs: num(b?.salaires_formateurs),
    achats_prestations: num(b?.achats_prestations),
    source: "saisie_manuelle",
    saisi_le: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("bpf_depots").upsert(ligne, { onConflict: "annee" });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("bpf_depot", String(annee), "saisie", { annee, total_produits: total, cerfa: ligne.cerfa }, u.email ?? null);
  return NextResponse.json({ ok: true });
}

