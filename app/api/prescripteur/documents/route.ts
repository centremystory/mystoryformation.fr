/**
 * MYSTORY — Documents echanges avec un organisme prescripteur.
 *
 * GET    → ses documents, avec un lien de telechargement signe de courte duree.
 * POST   → le partenaire depose un justificatif d'absence (multipart).
 * DELETE → il retire un justificatif qu'il vient de deposer par erreur.
 *
 * Les resultats et attestations, eux, sont deposes par le centre depuis le
 * back-office : le partenaire les telecharge, il ne les depose pas.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { sessionPrescripteur } from "@/lib/prescripteurAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documents";
const TAILLE_MAX = 8 * 1024 * 1024;
const TYPES_OK = ["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"];
// Le partenaire ne depose QUE des justificatifs : un resultat depose par lui n'aurait
// aucune valeur, c'est le centre qui les emet.
const TYPES_PARTENAIRE = ["justificatif_absence", "autre"];

export async function GET(req: NextRequest) {
  const s = await sessionPrescripteur(req);
  if (!s) return NextResponse.json({ ok: false, erreur: "Session expirée." }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("documents_partenaire")
    .select("id, demande_id, type, fichier_nom, taille_octets, commentaire, depose_par, depose_le, fichier_path, "
          + "demandes_inscription_partenaire:demande_id (candidat_nom, candidat_prenom)")
    .eq("partenaire_id", s.id).eq("actif", true)
    .order("depose_le", { ascending: false }).limit(300);

  // Un lien signe par document, valable une heure : le fichier n'est jamais public.
  const documents = await Promise.all((data ?? []).map(async (d: any) => {
    const { data: url } = await supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(d.fichier_path, 3600);
    const c = Array.isArray(d.demandes_inscription_partenaire)
      ? d.demandes_inscription_partenaire[0] : d.demandes_inscription_partenaire;
    return {
      id: d.id, demande_id: d.demande_id, type: d.type,
      nom: d.fichier_nom, taille: d.taille_octets, commentaire: d.commentaire,
      depose_par: d.depose_par, depose_le: d.depose_le,
      // « partenaire » = c'est lui qui l'a envoye ; sinon c'est le centre qui le lui rend.
      par_le_centre: d.depose_par !== "partenaire",
      candidat: c ? `${c.candidat_prenom} ${c.candidat_nom}` : null,
      url: url?.signedUrl ?? null,
    };
  }));
  return NextResponse.json({ ok: true, documents });
}

export async function POST(req: NextRequest) {
  const s = await sessionPrescripteur(req);
  if (!s) return NextResponse.json({ ok: false, erreur: "Session expirée." }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ ok: false, erreur: "Formulaire illisible." }, { status: 400 });
  }
  const type = String(form.get("type") ?? "justificatif_absence");
  const demandeId = String(form.get("demande_id") ?? "").trim() || null;
  const commentaire = String(form.get("commentaire") ?? "").trim().slice(0, 500);
  const fichier = form.get("fichier") as File | null;

  if (!TYPES_PARTENAIRE.includes(type)) {
    return NextResponse.json(
      { ok: false, erreur: "Seuls les justificatifs peuvent être déposés depuis votre espace." },
      { status: 400 });
  }
  if (!fichier || fichier.size === 0) {
    return NextResponse.json({ ok: false, erreur: "Aucun fichier." }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ ok: false, erreur: "Fichier trop lourd (8 Mo maximum)." }, { status: 400 });
  }
  if (!TYPES_OK.includes(fichier.type)) {
    return NextResponse.json(
      { ok: false, erreur: "Formats acceptés : photo (JPEG, PNG, HEIC, WebP) ou PDF." }, { status: 400 });
  }

  // Le justificatif doit porter sur UN DE SES candidats : sans ce controle, un
  // identifiant devine rattacherait un document au dossier d'un autre organisme.
  if (demandeId) {
    const { data: d } = await supabaseAdmin
      .from("demandes_inscription_partenaire")
      .select("id").eq("id", demandeId).eq("partenaire_id", s.id).maybeSingle();
    if (!d) {
      return NextResponse.json(
        { ok: false, erreur: "Ce candidat n'est pas dans votre liste." }, { status: 403 });
    }
  }

  const ext = (fichier.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 5);
  const chemin = `partenaires/${s.id}/justificatifs/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: eUp } = await supabaseAdmin.storage
    .from(BUCKET).upload(chemin, Buffer.from(await fichier.arrayBuffer()),
                         { contentType: fichier.type, upsert: false });
  if (eUp) return NextResponse.json({ ok: false, erreur: eUp.message }, { status: 500 });

  const { data, error } = await supabaseAdmin
    .from("documents_partenaire")
    .insert({
      partenaire_id: s.id, demande_id: demandeId, type,
      fichier_path: chemin, fichier_nom: fichier.name.slice(0, 200),
      taille_octets: fichier.size, commentaire: commentaire || null,
      depose_par: "partenaire",
    })
    .select("id").single();
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([chemin]);
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  await journal("document_partenaire", data.id, "depot_justificatif",
    { partenaire: s.raison_sociale, demande: demandeId }, `partenaire:${s.raison_sociale}`);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const s = await sessionPrescripteur(req);
  if (!s) return NextResponse.json({ ok: false, erreur: "Session expirée." }, { status: 401 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  const { data: d } = await supabaseAdmin
    .from("documents_partenaire")
    .select("id, depose_par").eq("id", id).eq("partenaire_id", s.id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Document introuvable." }, { status: 404 });
  // Un document remis PAR LE CENTRE ne se retire pas depuis le portail : il fait
  // partie de ce que nous avons rendu, et sa disparition serait inexplicable.
  if (d.depose_par !== "partenaire") {
    return NextResponse.json(
      { ok: false, erreur: "Ce document a été remis par le centre : il ne peut pas être retiré ici." },
      { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("documents_partenaire").update({ actif: false }).eq("id", id).eq("partenaire_id", s.id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("document_partenaire", id, "retrait", null, `partenaire:${s.raison_sociale}`);
  return NextResponse.json({ ok: true });
}
