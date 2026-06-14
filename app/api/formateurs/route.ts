/**
 * MYSTORY — /api/formateurs  (registre des formateurs / onboarding)
 * GET   → formateurs actifs + état de leurs documents (charte/contrat) + questionnaire répondu.
 * POST  { civilite?, prenom?, nom, email?, telephone?, type, raisonSociale?, siret?, adresse? } → crée (Direction).
 * PATCH { id, action:"archiver" } OU { id, ...champs } → archive / met à jour (Direction).
 * Pas de suppression. Journalisé (auteur = session).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["interne", "sous_traitant"];
function peutGerer(role?: string): boolean {
  return !role || role === "staff" || role === "direction";
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const { data, error } = await supabaseAdmin
    .from("formateurs")
    .select("id, civilite, prenom, nom, email, telephone, type, raison_sociale, siret, adresse, token, cree_le, formateur_documents(id, type, statut, sign_url, signe_le, fichier_signe_path), formateur_questionnaire(id, horodatage)")
    .eq("actif", true)
    .order("cree_le", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, formateurs: data ?? [] });
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peutGerer(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const nom = String(b?.nom ?? "").trim();
  const type = String(b?.type ?? "sous_traitant").trim();
  if (!nom) return NextResponse.json({ ok: false, erreur: "Nom requis." }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide." }, { status: 400 });

  const ligne: Record<string, unknown> = {
    nom, type,
    civilite: String(b?.civilite ?? "").trim() || null,
    prenom: String(b?.prenom ?? "").trim() || null,
    email: String(b?.email ?? "").trim() || null,
    telephone: String(b?.telephone ?? "").trim() || null,
    raison_sociale: String(b?.raisonSociale ?? "").trim() || null,
    siret: String(b?.siret ?? "").trim() || null,
    adresse: String(b?.adresse ?? "").trim() || null,
    auteur: u.email ?? null,
  };
  const { data, error } = await supabaseAdmin.from("formateurs").insert(ligne).select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("formateur", (data as any).id, "formateur_cree", { nom, type }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (data as any).id });
}

export async function PATCH(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!peutGerer(u.role)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (String(b?.action ?? "") === "archiver") {
    const { error } = await supabaseAdmin.from("formateurs").update({ actif: false }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("formateur", id, "formateur_archive", {}, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  const champs: Record<string, unknown> = {};
  for (const [k, col] of [["civilite", "civilite"], ["prenom", "prenom"], ["nom", "nom"], ["email", "email"],
    ["telephone", "telephone"], ["raisonSociale", "raison_sociale"], ["siret", "siret"], ["adresse", "adresse"]] as const) {
    if (typeof b?.[k] === "string") champs[col] = String(b[k]).trim() || null;
  }
  if (typeof b?.type === "string" && TYPES.includes(b.type)) champs.type = b.type;
  if (Object.keys(champs).length === 0) return NextResponse.json({ ok: false, erreur: "Rien à mettre à jour." }, { status: 400 });

  const { error } = await supabaseAdmin.from("formateurs").update(champs).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("formateur", id, "formateur_modifie", champs, u.email ?? null);
  return NextResponse.json({ ok: true });
}
