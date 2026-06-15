/**
 * MYSTORY — /api/examens/remboursements  (CDC §3.3 — Report / Remboursement / Avoir)
 * GET   ?statut=&type= → liste (embed vente + candidat + session) + avoir signé si présent.
 * POST  { numeroAttestation|venteId, type, montant?, motif, override? } → crée une DEMANDE.
 *        Garde-fous : motif obligatoire ; règle des 7 jours (examen < 7 j → override journalisé requis) ;
 *        montant remboursé/avoir ≤ déjà payé (montant vente − reste à payer).
 * PATCH { id, action: valider|effectuer|refuser } → workflow demande→validé→effectué|refusé (Direction).
 *        À « effectuer » : remboursement_total → vente Remboursé (libère la place) ;
 *        avoir → génère le PDF d'avoir numéroté (AV-AAAA-NNNNN) + archive.
 * Pas de delete. Tout journalisé avec auteur.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { getSignedUrl } from "@/lib/crm";
import { renderHtmlToPdf } from "@/lib/docuseal";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TYPES = ["report", "remboursement_total", "remboursement_partiel", "avoir"];

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function joursAvant(dateISO: string, todayISO: string): number {
  return Math.floor((new Date(dateISO + "T00:00:00Z").getTime() - new Date(todayISO + "T00:00:00Z").getTime()) / 86400000);
}
const estDirection = (u: SessionUser) => !u.role || u.role === "staff" || u.role === "direction";

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

function avoirHtml(p: { numero: string; date: string; candidat: string; montant: number; motif: string; ref: string }): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1f2430;font-size:13px;margin:40px;}
    h1{color:#2F72DE;font-size:22px;margin:0 0 4px;} .muted{color:#6b7280;font-size:11px;}
    table{width:100%;border-collapse:collapse;margin-top:18px;} td,th{border:1px solid #e6e9f0;padding:8px;text-align:left;}
    .tot{font-size:16px;font-weight:bold;color:#2F72DE;}
  </style></head><body>
    <h1>AVOIR</h1>
    <div class="muted">N° ${p.numero} · Émis le ${new Date(p.date).toLocaleDateString("fr-FR")}</div>
    <p style="margin-top:18px;"><strong>MYSTORY</strong> — SASU · SIRET 913 423 083 00017 · Déclaration d'activité n° 11756521775 (ne vaut pas agrément de l'État)<br>
    3 bis avenue de Gagny, 93220 Gagny</p>
    <p><strong>Bénéficiaire :</strong> ${p.candidat}</p>
    <table>
      <tr><th>Référence</th><th>Motif</th><th>Montant</th></tr>
      <tr><td>${p.ref}</td><td>${p.motif.replace(/</g, "&lt;")}</td><td class="tot">${p.montant.toFixed(2)} €</td></tr>
    </table>
    <p class="muted" style="margin-top:24px;">Avoir valable sur une prestation MYSTORY. Fait à Gagny.</p>
  </body></html>`;
}

export async function GET(req: NextRequest) {
  const g = await garde(req); if (g instanceof NextResponse) return g;
  const sp = req.nextUrl.searchParams;
  let q = supabaseAdmin
    .from("remboursements_examen")
    .select("*, ventes_examen:vente_id (numero_attestation, montant, reste_a_payer, statut_paiement, agence, type_examen, stagiaires:candidat_id (nom, prenom), sessions_examen:session_id (date_examen, horaire))")
    .order("cree_le", { ascending: false }).limit(300);
  const statut = sp.get("statut"); if (statut) q = q.eq("statut", statut);
  const type = sp.get("type"); if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  const lignes = await Promise.all((data ?? []).map(async (r: any) => ({
    ...r,
    avoir_url: r.avoir_path ? await getSignedUrl(r.avoir_path, 3600).catch(() => null) : null,
  })));
  return NextResponse.json({ ok: true, remboursements: lignes });
}

export async function POST(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const type = String(b?.type ?? "");
  const motif = String(b?.motif ?? "").trim();
  const override = b?.override === true;
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, erreur: "Type invalide." }, { status: 400 });
  if (!motif) return NextResponse.json({ ok: false, erreur: "Motif obligatoire." }, { status: 400 });

  // Résolution de la vente
  let vente: any = null;
  if (b?.venteId) {
    const { data } = await supabaseAdmin.from("ventes_examen")
      .select("id, montant, reste_a_payer, statut_paiement, sessions_examen:session_id (date_examen)").eq("id", String(b.venteId)).maybeSingle();
    vente = data;
  } else if (b?.numeroAttestation) {
    const { data } = await supabaseAdmin.from("ventes_examen")
      .select("id, montant, reste_a_payer, statut_paiement, sessions_examen:session_id (date_examen)").eq("numero_attestation", String(b.numeroAttestation).trim()).maybeSingle();
    vente = data;
  }
  if (!vente) return NextResponse.json({ ok: false, erreur: "Vente introuvable (n° d'attestation ou identifiant)." }, { status: 404 });

  // Règle des 7 jours
  const today = aujourdHuiParisISO();
  const dateExamen = vente.sessions_examen?.date_examen ?? null;
  if (dateExamen && joursAvant(dateExamen, today) < 7 && !override) {
    return NextResponse.json({ ok: false, erreur: "Examen à moins de 7 jours : report/remboursement interdit sauf dérogation (override).", besoinOverride: true }, { status: 409 });
  }

  // Montant
  const dejaPaye = Number(vente.montant ?? 0) - Number(vente.reste_a_payer ?? 0);
  let montant = 0;
  if (type === "remboursement_total") {
    montant = Math.max(0, dejaPaye);
  } else if (type === "remboursement_partiel" || type === "avoir") {
    montant = Number(b?.montant);
    if (!(montant > 0)) return NextResponse.json({ ok: false, erreur: "Montant requis (> 0)." }, { status: 400 });
    if (montant > dejaPaye + 0.001) return NextResponse.json({ ok: false, erreur: `Montant supérieur au déjà payé (${dejaPaye.toFixed(2)} €).` }, { status: 400 });
  }

  const { data: ins, error } = await supabaseAdmin.from("remboursements_examen")
    .insert({ vente_id: vente.id, type, montant, motif, override_7j: override, created_by: u.email ?? null })
    .select("id").single();
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("ventes_examen", vente.id, "remboursement_demande", { type, montant, motif, override }, u.email ?? null);
  return NextResponse.json({ ok: true, id: (ins as any).id });
}

export async function PATCH(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  if (!estDirection(u)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  const action = String(b?.action ?? "");
  if (!id || !["valider", "effectuer", "refuser"].includes(action)) {
    return NextResponse.json({ ok: false, erreur: "id et action (valider|effectuer|refuser) requis." }, { status: 400 });
  }

  const { data: r } = await supabaseAdmin.from("remboursements_examen").select("*").eq("id", id).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, erreur: "Demande introuvable." }, { status: 404 });
  const maintenant = new Date().toISOString();

  if (action === "refuser") {
    if ((r as any).statut === "effectue") return NextResponse.json({ ok: false, erreur: "Déjà effectué." }, { status: 409 });
    await supabaseAdmin.from("remboursements_examen").update({ statut: "refuse", decided_by: u.email ?? null, decided_le: maintenant }).eq("id", id);
    await journal("ventes_examen", (r as any).vente_id, "remboursement_refuse", { type: (r as any).type }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  if (action === "valider") {
    if ((r as any).statut !== "demande") return NextResponse.json({ ok: false, erreur: "Seule une demande peut être validée." }, { status: 409 });
    await supabaseAdmin.from("remboursements_examen").update({ statut: "valide", decided_by: u.email ?? null, decided_le: maintenant }).eq("id", id);
    await journal("ventes_examen", (r as any).vente_id, "remboursement_valide", { type: (r as any).type, montant: (r as any).montant }, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  // effectuer
  if ((r as any).statut !== "valide") return NextResponse.json({ ok: false, erreur: "À valider avant d'effectuer." }, { status: 409 });
  const type = (r as any).type as string;
  const maj: Record<string, unknown> = { statut: "effectue", decided_by: u.email ?? null, decided_le: maintenant };

  // Avoir : génère le PDF numéroté AVANT de marquer effectué (sinon on bloque).
  if (type === "avoir") {
    try {
      const { data: candData } = await supabaseAdmin.from("ventes_examen")
        .select("numero_attestation, stagiaires:candidat_id (nom, prenom)").eq("id", (r as any).vente_id).maybeSingle();
      const cand = candData as any;
      const { data: numData } = await supabaseAdmin.rpc("next_avoir_numero");
      const numero = String(numData);
      const candidat = `${cand?.stagiaires?.prenom ?? ""} ${cand?.stagiaires?.nom ?? ""}`.trim() || "Candidat";
      const html = avoirHtml({ numero, date: maintenant, candidat, montant: Number((r as any).montant), motif: (r as any).motif, ref: cand?.numero_attestation ?? (r as any).vente_id });
      const { pdf } = await renderHtmlToPdf({ html, name: `Avoir ${numero}` });
      const path = `examens/${(r as any).vente_id}/avoir_${numero}.pdf`;
      const up = await supabaseAdmin.storage.from("documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      maj.avoir_numero = numero; maj.avoir_path = path;
    } catch (e: any) {
      return NextResponse.json({ ok: false, erreur: `Génération de l'avoir impossible : ${e?.message ?? e}` }, { status: 500 });
    }
  }

  await supabaseAdmin.from("remboursements_examen").update(maj).eq("id", id);

  // Remboursement total → libère la place (vente Remboursé).
  if (type === "remboursement_total") {
    await supabaseAdmin.from("ventes_examen").update({ statut_paiement: "Remboursé" }).eq("id", (r as any).vente_id);
  }

  await journal("ventes_examen", (r as any).vente_id, "remboursement_effectue", { type, montant: (r as any).montant, avoir: maj.avoir_numero ?? null }, u.email ?? null);
  return NextResponse.json({ ok: true, avoirNumero: maj.avoir_numero ?? null });
}
