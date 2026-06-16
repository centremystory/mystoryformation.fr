/**
 * MYSTORY — /api/factures
 * GET   — liste des factures (50 dernières) + dossiers/ventes à facturer.
 * POST  — émet la facture d'un dossier OU d'une vente (idempotent) et l'envoie par email.
 * PATCH — { id, action: "payee" } marque payée (tampon PAYÉE, PDF regénéré)
 *         { id, action: "renvoyer" } renvoie l'email avec le PDF.
 * Protégé par le middleware global (session équipe ou Bearer n8n).
 * Restriction : émettre/marquer payée/renvoyer = action « facturation » (Direction + Secrétariat).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { peut } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facturerDossier, facturerVente, envoyerFacture, marquerPayee } from "@/lib/factures";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Authentifie et renvoie l'utilisateur, ou une réponse 401 à retourner tel quel. */
async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
}

const refusFacturation = () => NextResponse.json(
  { ok: false, erreur: "Action réservée à la Direction et au Secrétariat (facturation)." },
  { status: 403 },
);
/** Les tokens de service (n8n/cron, sans rôle) et la session équipe passent ; un rôle individuel non autorisé est bloqué. */
function peutFacturer(u: SessionUser): boolean {
  return !u.role || peut(u.role, "facturation");
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;

  const { data: factures, error } = await supabaseAdmin
    .from("factures")
    .select("id, numero, montant, designation, client, statut, date_emission, date_paiement, dossier_id, vente_id")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // À facturer : dossiers sans facture — payeur direct dès l'inscription ;
  // CPF uniquement après service fait validé (verrou art. L.6323-12).
  const { data: dossiers } = await supabaseAdmin
    .from("dossiers")
    .select("id, certif, montant, remise, financement, origine_fonds, service_fait_valide, stagiaires:stagiaire_id (civilite, prenom, nom)");
  const { data: deja } = await supabaseAdmin.from("factures").select("dossier_id, vente_id");
  const dossiersFactures = new Set((deja ?? []).map((f: any) => f.dossier_id).filter(Boolean));
  const ventesFacturees = new Set((deja ?? []).map((f: any) => f.vente_id).filter(Boolean));

  const aFacturer = (dossiers ?? [])
    .filter((d: any) => !dossiersFactures.has(d.id) && d.montant)
    .map((d: any) => {
      const estCpf = d.origine_fonds === "CPF_CDC" || d.financement === "CPF";
      const brut = Number(d.montant ?? 0);
      const remise = estCpf ? 0 : Math.min(Math.max(0, Number(d.remise ?? 0)), brut);
      return {
        dossierId: d.id,
        certif: d.certif,
        montant: Math.max(0, brut - remise), // net après remise (hors CPF)
        remise: remise || 0,
        client: `${d.stagiaires?.civilite ?? ""} ${d.stagiaires?.prenom ?? ""} ${d.stagiaires?.nom ?? ""}`.trim(),
        estCpf,
        facturable: !estCpf || !!d.service_fait_valide,
        motifBlocage: estCpf && !d.service_fait_valide ? "CPF : en attente du service fait validé EDOF" : null,
      };
    });

  // Ventes d'examen sans facture (rattrapage : la facturation est automatique à la vente).
  const { data: ventes } = await supabaseAdmin
    .from("ventes_examen")
    .select("id, numero_attestation, type_examen, montant, statut_paiement, stagiaires:candidat_id (civilite, prenom, nom)")
    .order("created_at", { ascending: false })
    .limit(100);
  const ventesAFacturer = (ventes ?? [])
    .filter((v: any) => !ventesFacturees.has(v.id) && !["Annulé", "Remboursé"].includes(v.statut_paiement))
    .map((v: any) => ({
      venteId: v.id,
      numeroAttestation: v.numero_attestation,
      type: v.type_examen,
      montant: v.montant,
      client: `${v.stagiaires?.civilite ?? ""} ${v.stagiaires?.prenom ?? ""} ${v.stagiaires?.nom ?? ""}`.trim(),
    }));

  return NextResponse.json({ ok: true, factures: factures ?? [], aFacturer, ventesAFacturer });
}

export async function POST(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutFacturer(g)) return refusFacturation();
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossier_id ?? "").trim();
  const venteId = String(body?.vente_id ?? "").trim();
  const auteur = g.email ?? (String(body?.auteur ?? "").trim() || null);
  if (!dossierId && !venteId) return NextResponse.json({ ok: false, erreur: "dossier_id ou vente_id requis." }, { status: 400 });
  if (dossierId && venteId) return NextResponse.json({ ok: false, erreur: "Une facture porte sur UNE entité : dossier OU vente." }, { status: 400 });

  try {
    const f = dossierId ? await facturerDossier(dossierId, auteur) : await facturerVente(venteId, auteur);
    const envoi = body?.envoyer === false ? { ok: false, erreur: "Envoi non demandé." } : await envoyerFacture(f.id, "emission", auteur);
    return NextResponse.json({
      ok: true,
      factureId: f.id,
      numero: f.numero,
      montant: f.montant,
      client: f.client,
      dejaExistante: f.dejaExistante,
      email: envoi.ok ? { envoye: true } : { envoye: false, erreur: envoi.erreur },
    });
  } catch (e: any) {
    // Les verrous (CPF/service fait…) remontent ici avec leur message explicite.
    return NextResponse.json({ ok: false, erreur: e?.message ?? String(e) }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  if (!peutFacturer(g)) return refusFacturation();
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const action = String(body?.action ?? "").trim();
  const auteur = g.email ?? (String(body?.auteur ?? "").trim() || null);
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  if (action === "payee") {
    const r = await marquerPayee(id, auteur);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erreur: r.erreur }, { status: 409 });
  }
  if (action === "renvoyer") {
    const r = await envoyerFacture(id, "emission", auteur);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erreur: r.erreur }, { status: 409 });
  }
  return NextResponse.json({ ok: false, erreur: "action : payee ou renvoyer." }, { status: 400 });
}
