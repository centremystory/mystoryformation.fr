// app/api/examens/attestations/renvoyer/route.ts
// POST { examen_ref, source } → renvoie au candidat, par email, le PDF de résultat déjà déposé.
// Réutilise la dernière attestation active (table attestations_tef, générique examen_ref+source).
// Protégé par requireUser (auteur journalisé). Pas de DELETE.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { journal } from "@/lib/examens";

export const dynamic = "force-dynamic";
const BUCKET = "documents";

function tableSource(source: string): "examens" | "ventes_examen" | null {
  if (source === "import") return "examens";
  if (source === "vente") return "ventes_examen";
  return null;
}

export async function POST(req: NextRequest) {
  let u;
  try { u = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const examenRef = String(body?.examen_ref ?? "").trim();
  const source = String(body?.source ?? "").trim();
  const table = tableSource(source);
  if (!examenRef || !table) return NextResponse.json({ ok: false, erreur: "examen_ref + source requis." }, { status: 400 });

  // 1) Dernière attestation active du candidat
  const { data: att } = await supabaseAdmin
    .from("attestations_tef")
    .select("fichier_url, fichier_nom")
    .eq("examen_ref", examenRef)
    .eq("source", source)
    .eq("actif", true)
    .order("depose_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!att) return NextResponse.json({ ok: false, erreur: "Aucun résultat déposé pour ce candidat." }, { status: 404 });

  // 2) Identité + email du candidat selon la source
  let email = "", nom = "", prenom = "", civilite = "";
  if (source === "vente") {
    const { data } = await supabaseAdmin
      .from("ventes_examen")
      .select("stagiaires:candidat_id ( civilite, nom, prenom, email )")
      .eq("id", examenRef)
      .maybeSingle();
    const s: any = (data as any)?.stagiaires;
    email = s?.email ?? ""; nom = s?.nom ?? ""; prenom = s?.prenom ?? ""; civilite = s?.civilite ?? "";
  } else {
    const { data } = await supabaseAdmin
      .from("examens")
      .select("civilite, nom, prenom, email")
      .eq("id", examenRef)
      .maybeSingle();
    const s: any = data;
    email = s?.email ?? ""; nom = s?.nom ?? ""; prenom = s?.prenom ?? ""; civilite = s?.civilite ?? "";
  }
  if (!email) return NextResponse.json({ ok: false, erreur: "Aucune adresse email connue pour ce candidat." }, { status: 400 });

  // 3) Télécharger le PDF depuis le bucket privé
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(att.fichier_url);
  if (dlErr || !blob) return NextResponse.json({ ok: false, erreur: "Fichier de résultat indisponible." }, { status: 500 });
  const buffer = Buffer.from(await blob.arrayBuffer());

  // 4) Email avec le résultat en pièce jointe
  const corps = `<p>Bonjour ${civilite} ${nom} ${prenom},</p>
    <p>Vous trouverez ci-joint votre résultat d'examen.</p>
    <p>Pour toute question, vous pouvez nous écrire à contact@mystoryformation.fr ou nous appeler au 06 81 43 16 54.</p>
    <p>Bien cordialement,<br/>L'équipe MYSTORY Formation</p>`;
  const env = await envoyerEmail({
    a: email,
    objet: "Votre résultat d'examen — MYSTORY Formation",
    html: gabaritEmail("Votre résultat d'examen", corps),
    piecesJointes: [{ nom: att.fichier_nom || "resultat.pdf", contenu: buffer }],
    entite: table,
    entiteId: examenRef,
  });
  if (!env.ok) return NextResponse.json({ ok: false, erreur: env.erreur ?? "Envoi impossible." }, { status: 500 });

  await journal(table, examenRef, "attestation_renvoyee", { email }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
