/**
 * MYSTORY — Back-office : rendre un resultat ou une attestation a un partenaire.
 *
 * GET  → les documents d'un partenaire (justificatifs reçus et documents rendus).
 * POST → depose un resultat ou une attestation, que le partenaire telechargera.
 *
 * Le candidat reçoit normalement son attestation par la CCI. Quand il ne la reçoit
 * pas, il se retourne vers son organisme, qui se retourne vers nous : le partenaire
 * la telecharge lui-meme depuis son espace au lieu de nous appeler.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["direction", "manager", "back_office"] as const;
const BUCKET = "documents";
const TAILLE_MAX = 12 * 1024 * 1024;
const TYPES_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

async function garde(req: NextRequest) {
  try { return { u: await requireRole(req, ROLES), code: 0 }; }
  catch (e) {
    if (e instanceof UnauthorizedError) return { u: null, code: 401 };
    if (e instanceof ForbiddenError) return { u: null, code: 403 };
    throw e;
  }
}
function refus(code: number) {
  return code === 403
    ? NextResponse.json({ ok: false, erreur: "Réservé à l'encadrement." }, { status: 403 })
    : NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  const partenaireId = req.nextUrl.searchParams.get("partenaire_id");
  let q = supabaseAdmin
    .from("documents_partenaire")
    .select("id, partenaire_id, demande_id, type, fichier_nom, fichier_path, commentaire, "
          + "depose_par, depose_le, partenaires:partenaire_id (raison_sociale), "
          + "demandes_inscription_partenaire:demande_id (candidat_nom, candidat_prenom)")
    .eq("actif", true).order("depose_le", { ascending: false }).limit(300);
  if (partenaireId) q = q.eq("partenaire_id", partenaireId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const documents = await Promise.all((data ?? []).map(async (d: any) => {
    const { data: url } = await supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(d.fichier_path, 3600);
    const p = Array.isArray(d.partenaires) ? d.partenaires[0] : d.partenaires;
    const c = Array.isArray(d.demandes_inscription_partenaire)
      ? d.demandes_inscription_partenaire[0] : d.demandes_inscription_partenaire;
    return {
      id: d.id, partenaire_id: d.partenaire_id,
      partenaire: p?.raison_sociale ?? "—",
      candidat: c ? `${c.candidat_prenom} ${c.candidat_nom}` : null,
      type: d.type, nom: d.fichier_nom, commentaire: d.commentaire,
      depose_par: d.depose_par, depose_le: d.depose_le,
      recu_du_partenaire: d.depose_par === "partenaire",
      url: url?.signedUrl ?? null,
    };
  }));
  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ ok: false, erreur: "Formulaire illisible." }, { status: 400 });
  }
  const partenaireId = String(form.get("partenaire_id") ?? "").trim();
  const demandeId = String(form.get("demande_id") ?? "").trim() || null;
  const type = String(form.get("type") ?? "resultat");
  const commentaire = String(form.get("commentaire") ?? "").trim().slice(0, 500);
  const fichier = form.get("fichier") as File | null;

  if (!partenaireId) return NextResponse.json({ ok: false, erreur: "Partenaire requis." }, { status: 400 });
  if (!["resultat", "attestation", "autre"].includes(type)) {
    return NextResponse.json({ ok: false, erreur: "Type de document invalide." }, { status: 400 });
  }
  if (!fichier || fichier.size === 0) {
    return NextResponse.json({ ok: false, erreur: "Aucun fichier." }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ ok: false, erreur: "Fichier trop lourd (12 Mo maximum)." }, { status: 400 });
  }
  if (!TYPES_OK.includes(fichier.type)) {
    return NextResponse.json({ ok: false, erreur: "Formats acceptés : PDF ou image." }, { status: 400 });
  }

  // La demande, si elle est precisee, doit appartenir a CE partenaire : sinon on
  // rendrait le resultat d'un candidat a un autre organisme.
  if (demandeId) {
    const { data: d } = await supabaseAdmin
      .from("demandes_inscription_partenaire")
      .select("id").eq("id", demandeId).eq("partenaire_id", partenaireId).maybeSingle();
    if (!d) {
      return NextResponse.json(
        { ok: false, erreur: "Ce candidat n'appartient pas à ce partenaire." }, { status: 400 });
    }
  }

  const ext = (fichier.name.split(".").pop() ?? "pdf").toLowerCase().slice(0, 5);
  const chemin = `partenaires/${partenaireId}/rendus/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: eUp } = await supabaseAdmin.storage
    .from(BUCKET).upload(chemin, Buffer.from(await fichier.arrayBuffer()),
                         { contentType: fichier.type, upsert: false });
  if (eUp) return NextResponse.json({ ok: false, erreur: eUp.message }, { status: 500 });

  const { data, error } = await supabaseAdmin
    .from("documents_partenaire")
    .insert({
      partenaire_id: partenaireId, demande_id: demandeId, type,
      fichier_path: chemin, fichier_nom: fichier.name.slice(0, 200),
      taille_octets: fichier.size, commentaire: commentaire || null,
      depose_par: u.email ?? "centre",
    })
    .select("id").single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  await journal("document_partenaire", data.id, `remise_${type}`,
    { partenaire_id: partenaireId, demande: demandeId }, u.email ?? null);
  return NextResponse.json({ ok: true, id: data.id });
}
