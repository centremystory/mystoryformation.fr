/**
 * MYSTORY — /api/reclamations/export · Registre des réclamations (preuve Qualiopi, indicateur 31).
 * GET ?format=csv  → CSV (séparateur « ; », UTF-8 BOM) de tout le registre.
 * GET ?format=pdf  → PDF à la charte (synthèse + tableau chronologique) pour le classeur d'audit.
 * Inclut tous les statuts (ouverte / en cours / résolue), hors archivés (actif=false).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderHtmlToPdf } from "@/lib/docuseal";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Rec = {
  type: string; candidat_nom: string | null; candidat_prenom: string | null;
  candidat_email: string | null; candidat_telephone: string | null;
  objet: string; detail: string | null; statut: string; priorite: string;
  agence: string | null; cree_par: string | null; cree_le: string;
  resolu_le: string | null; resolu_par: string | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function dFR(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function delaiJours(a: string, b: string | null): string {
  if (!b) return "";
  return String(Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)));
}
const libStatut: Record<string, string> = { ouverte: "Ouverte", en_cours: "En cours", resolue: "Résolue" };
const libType = (t: string) => (t === "examen" ? "Examen" : "Formation");

async function charger(): Promise<Rec[]> {
  const { data } = await supabaseAdmin
    .from("reclamations")
    .select("type, candidat_nom, candidat_prenom, candidat_email, candidat_telephone, objet, detail, statut, priorite, agence, cree_par, cree_le, resolu_le, resolu_par")
    .eq("actif", true)
    .order("cree_le", { ascending: true });
  return (data ?? []) as Rec[];
}

function csv(rows: Rec[]): string {
  const head = ["Date ouverture", "Type", "Candidat", "Email", "Téléphone", "Objet", "Détail", "Priorité", "Statut", "Date résolution", "Délai (jours)", "Traité par", "Agence"];
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lignes = rows.map((r) => [
    dFR(r.cree_le), libType(r.type), `${r.candidat_prenom ?? ""} ${r.candidat_nom ?? ""}`.trim(),
    r.candidat_email ?? "", r.candidat_telephone ?? "", r.objet, r.detail ?? "", r.priorite,
    libStatut[r.statut] ?? r.statut, dFR(r.resolu_le), delaiJours(r.cree_le, r.resolu_le), r.resolu_par ?? "", r.agence ?? "",
  ].map(cell).join(";"));
  return "\uFEFF" + [head.join(";"), ...lignes].join("\r\n");
}

function pdfHtml(rows: Rec[]): string {
  const total = rows.length;
  const resolues = rows.filter((r) => r.statut === "resolue");
  const ouvertes = rows.filter((r) => r.statut === "ouverte").length;
  const enCours = rows.filter((r) => r.statut === "en_cours").length;
  const delais = resolues.map((r) => Number(delaiJours(r.cree_le, r.resolu_le))).filter((n) => !isNaN(n));
  const delaiMoyen = delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null;
  const auj = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  const lignes = rows.map((r) => `<tr>
    <td>${dFR(r.cree_le)}</td><td>${libType(r.type)}</td>
    <td>${esc(`${r.candidat_prenom ?? ""} ${r.candidat_nom ?? ""}`.trim())}</td>
    <td>${esc(r.objet)}</td><td>${libStatut[r.statut] ?? r.statut}</td>
    <td>${dFR(r.resolu_le)}</td><td style="text-align:center;">${delaiJours(r.cree_le, r.resolu_le)}</td>
    <td>${esc(r.resolu_par ?? "")}</td></tr>`).join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color:#1c2433; font-size:8.5pt; margin:0; }
  .brandbar { height:5px; background:#2F72DE; border-radius:3px; }
  header { display:flex; justify-content:space-between; align-items:flex-start; margin-top:8px; }
  .org h1 { color:#2F72DE; font-size:15pt; margin:0; }
  .org .legal { font-size:7pt; color:#5b6472; }
  .tag { background:#2F72DE; color:#fff; font-size:7.5pt; padding:3px 8px; border-radius:3px; }
  h2 { text-align:center; font-size:12pt; margin:14px 0 2px; }
  .sub { text-align:center; font-size:8pt; color:#5b6472; margin-bottom:8px; }
  .synth { display:flex; gap:8px; margin:8px 0; }
  .synth div { flex:1; border:1px solid #e3e8f0; border-radius:6px; padding:6px; text-align:center; }
  .synth .n { font-size:13pt; font-weight:700; color:#2F72DE; }
  .synth .l { font-size:7pt; color:#5b6472; }
  table { width:100%; border-collapse:collapse; font-size:7.6pt; }
  th { background:#f3f7fe; color:#2F72DE; text-align:left; padding:4px 5px; border-bottom:1px solid #d8e4fb; }
  td { padding:3px 5px; border-bottom:1px solid #eef1f6; vertical-align:top; }
  footer { position:fixed; bottom:0; left:0; right:0; border-top:1px solid #e3e8f0; padding-top:3px; font-size:6.4pt; color:#7a8290; text-align:center; }
  </style></head><body>
  <footer>MYSTORY — SASU · SIRET 913 423 083 00017 · Déclaration d'activité n° 11756521775 (ne vaut pas agrément) · Gagny, 3 bis av. de Gagny, 93220 · contact@mystoryformation.fr</footer>
  <div class="brandbar"></div>
  <header>
    <div class="org"><h1>MYSTORY</h1><div class="legal">SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017</div></div>
    <span class="tag">QUALIOPI · IND. 31</span>
  </header>
  <h2>Registre des réclamations</h2>
  <div class="sub">Réclamations des candidats à l'examen et des stagiaires en formation — généré le ${auj}</div>
  <div class="synth">
    <div><div class="n">${total}</div><div class="l">Total</div></div>
    <div><div class="n">${ouvertes}</div><div class="l">Ouvertes</div></div>
    <div><div class="n">${enCours}</div><div class="l">En cours</div></div>
    <div><div class="n">${resolues.length}</div><div class="l">Résolues</div></div>
    <div><div class="n">${delaiMoyen ?? "—"}${delaiMoyen != null ? " j" : ""}</div><div class="l">Délai moyen</div></div>
  </div>
  <table>
    <thead><tr><th>Ouverte le</th><th>Type</th><th>Candidat</th><th>Objet</th><th>Statut</th><th>Résolue le</th><th>Délai (j)</th><th>Traité par</th></tr></thead>
    <tbody>${lignes || `<tr><td colspan="8" style="text-align:center; color:#7a8290; padding:10px;">Aucune réclamation enregistrée.</td></tr>`}</tbody>
  </table>
  </body></html>`;
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const format = String(req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  const rows = await charger();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "pdf") {
    const { pdf } = await renderHtmlToPdf({ html: pdfHtml(rows), name: `Registre_reclamations_${stamp}.pdf` });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Registre_reclamations_${stamp}.pdf"` },
    });
  }
  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Registre_reclamations_${stamp}.csv"` },
  });
}
