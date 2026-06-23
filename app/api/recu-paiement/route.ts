// app/api/recu-paiement/route.ts — Reçu de paiement (justificatif non comptable, aucun numéro consommé).
// GET  ?id=&source=vente|import → télécharge le PDF.
// POST { id, source }          → l'envoie par email au candidat.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySession } from "@/lib/auth";
import { envoyerEmail, gabaritEmail } from "@/lib/email";
import { genererRecuPaiementPdf, type RecuPaiement } from "@/lib/recu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", CIVIQUE: "Examen civique", PLATEFORME: "Application d'entraînement" };

async function construire(id: string, source: string): Promise<RecuPaiement | null> {
  const { data: c } = await supabaseAdmin
    .from("v_candidats_examen")
    .select("id, source, nom, prenom, civilite, email, telephone, type_norm, sous_type, date_examen, agence, statut_paiement, reste_a_payer, numero_attestation, numero_facture, vendu_par, montant")
    .eq("id", id).eq("source", source).maybeSingle();
  if (!c) return null;
  const row = c as any;

  // mode_paiement + date de règlement depuis la table sous-jacente
  let mode_paiement: string | null = null;
  let date_paiement: string | null = null;
  if (source === "vente") {
    const { data: v } = await supabaseAdmin.from("ventes_examen").select("mode_paiement, date_inscription").eq("id", id).maybeSingle();
    mode_paiement = (v as any)?.mode_paiement ?? null;
    date_paiement = (v as any)?.date_inscription ?? null;
  } else {
    const { data: e } = await supabaseAdmin.from("examens").select("mode_paiement, date_inscription").eq("id", id).maybeSingle();
    mode_paiement = (e as any)?.mode_paiement ?? null;
    date_paiement = (e as any)?.date_inscription ?? null;
  }

  return {
    civilite: row.civilite, nom: row.nom, prenom: row.prenom, email: row.email, telephone: row.telephone,
    type_label: LABEL[row.type_norm] ?? "Prestation d'examen",
    sous_type: row.sous_type, date_examen: row.date_examen,
    montant: row.montant, mode_paiement, statut_paiement: row.statut_paiement, reste_a_payer: row.reste_a_payer,
    numero_attestation: row.numero_attestation, numero_facture: row.numero_facture,
    date_paiement, agence: row.agence, referent: row.vendu_par,
  };
}

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
  const source = String(req.nextUrl.searchParams.get("source") ?? "").trim();
  if (!id || !["vente", "import"].includes(source)) return NextResponse.json({ ok: false, erreur: "id et source requis." }, { status: 400 });

  const data = await construire(id, source);
  if (!data) return NextResponse.json({ ok: false, erreur: "Candidat introuvable." }, { status: 404 });

  try {
    const pdf = await genererRecuPaiementPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Recu_paiement_${(data.nom ?? "candidat").replace(/[^A-Za-z0-9]/g, "_")}.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e.message ?? "Génération impossible." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? "").trim();
  const source = String(b?.source ?? "").trim();
  if (!id || !["vente", "import"].includes(source)) return NextResponse.json({ ok: false, erreur: "id et source requis." }, { status: 400 });

  const data = await construire(id, source);
  if (!data) return NextResponse.json({ ok: false, erreur: "Candidat introuvable." }, { status: 404 });
  if (!data.email) return NextResponse.json({ ok: false, erreur: "Ce candidat n'a pas d'adresse email." }, { status: 400 });

  const u = await verifySession(req);
  try {
    const pdf = await genererRecuPaiementPdf(data);
    const corps = `
      <p>Bonjour ${data.prenom ?? ""},</p>
      <p>Vous trouverez ci-joint votre <strong>reçu de paiement</strong> pour votre inscription à l'examen.</p>
      <p>Pour toute question : 06 81 43 16 54 · contact@mystoryformation.fr</p>
      <p>L'équipe MYSTORY</p>`;
    const res = await envoyerEmail({
      a: data.email,
      objet: "Votre reçu de paiement — MYSTORY",
      html: gabaritEmail("Reçu de paiement", corps),
      piecesJointes: [{ nom: `Recu_paiement_${(data.nom ?? "candidat").replace(/[^A-Za-z0-9]/g, "_")}.pdf`, contenu: pdf }],
      entite: source === "vente" ? "ventes_examen" : "examens",
      entiteId: id,
      auteur: u?.email ?? null,
    });
    if (!res.ok) throw new Error(res.erreur ?? "Envoi impossible.");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e.message ?? "Envoi impossible." }, { status: 500 });
  }
}
