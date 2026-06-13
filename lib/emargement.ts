/**
 * MYSTORY — Feuille d'émargement générée À PARTIR DU RÉEL (Brique B2).
 *
 * Conformité (§4/§5 de la mission) : INTERDIT de pré-remplir / pré-dater / pré-signer.
 * La feuille ne contient QUE les demi-journées réellement émargées (deux signatures
 * présentes → emarge_le non nul). Les signatures capturées (PNG dans Storage) sont
 * intégrées en base64 directement dans le HTML, puis le HTML est rendu en PDF par DocuSeal.
 * Lieu unique : Gagny.
 */
import { supabaseAdmin } from "./supabaseAdmin";

const BUCKET = "documents";
const BLEU = "#2F72DE";

const DEMI: Record<string, { label: string; horaire: string }> = {
  matin: { label: "Matin", horaire: "9h30 – 12h30" },
  apres_midi: { label: "Après-midi", horaire: "14h00 – 17h00" },
};

function frDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso + "T00:00:00"));
  } catch { return iso; }
}
function frDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}
function nombreFR(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}
function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * URL signée temporaire d'une signature (image PNG du Storage privé).
 * On privilégie l'URL à un data URI base64 : c'est le mécanisme déjà éprouvé par DocuSeal
 * pour le cachet/la signature de la convention (images référencées par URL). 1 h = largement
 * suffisant pour la durée du rendu PDF.
 */
async function signatureUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export interface FeuilleEmargement {
  html: string;
  nbSeances: number;
  totalHeures: number;
}

/**
 * Construit le HTML de la feuille d'émargement réelle d'un dossier.
 * Renvoie null s'il n'existe AUCUNE demi-journée émargée (on ne génère pas une feuille vide).
 */
export async function genererFeuilleEmargementHtml(dossierId: string): Promise<FeuilleEmargement | null> {
  const { data: d } = await supabaseAdmin
    .from("dossiers")
    .select("certif, numero_edof, stagiaire:stagiaires!stagiaire_id ( civilite, prenom, nom )")
    .eq("id", dossierId)
    .maybeSingle();
  if (!d) return null;
  const st = (d as any).stagiaire ?? {};
  const stagiaire = `${st.civilite ? st.civilite + " " : ""}${st.prenom ?? ""} ${st.nom ?? ""}`.trim();
  const certif = (d as any).certif === "LEVELTEL" ? "LEVELTEL FLE — RS6427" : "TEF IRN — RS6775";
  const edof = (d as any).numero_edof ?? "";

  const { data: seances } = await supabaseAdmin
    .from("planning")
    .select("date_seance, demi_journee, heures_realisees, emarge_le, signature_stagiaire_url, signature_formatrice_url, formatrice:formatrices!formatrice_id ( nom )")
    .eq("dossier_id", dossierId)
    .not("emarge_le", "is", null)
    .order("date_seance", { ascending: true })
    .order("demi_journee", { ascending: true });

  if (!seances || seances.length === 0) return null;

  let total = 0;
  const lignes: string[] = [];
  for (const s of seances as any[]) {
    total += Number(s.heures_realisees || 0);
    const sigS = await signatureUrl(s.signature_stagiaire_url);
    const sigF = await signatureUrl(s.signature_formatrice_url);
    const dm = DEMI[s.demi_journee] ?? { label: s.demi_journee, horaire: "" };
    lignes.push(`<tr>
      <td>${frDate(s.date_seance)}</td>
      <td><b>${dm.label}</b><br><span class="muted">${dm.horaire}</span></td>
      <td class="center">${nombreFR(Number(s.heures_realisees))} h</td>
      <td class="sig">${sigS ? `<img src="${sigS}" alt="signature stagiaire">` : "—"}</td>
      <td class="sig">${sigF ? `<img src="${sigF}" alt="signature formatrice">` : "—"}<br><span class="muted">${esc(s.formatrice?.nom ?? "")}</span></td>
      <td class="center muted">${frDateTime(s.emarge_le)}</td>
    </tr>`);
  }

  const genereLe = frDateTime(new Date().toISOString());

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; margin: 0; padding: 28px 32px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${BLEU}; padding-bottom: 12px; }
  .brand { color: ${BLEU}; font-size: 24px; font-weight: 800; letter-spacing: .5px; }
  h1 { font-size: 16px; margin: 18px 0 4px; }
  .meta { margin: 12px 0 6px; }
  .meta div { margin: 2px 0; }
  .label { color: #64748b; display: inline-block; min-width: 130px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: ${BLEU}; color: #fff; font-size: 11px; text-align: left; padding: 8px; }
  td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: middle; }
  .center { text-align: center; }
  .muted { color: #64748b; font-size: 10px; }
  .sig { width: 150px; height: 56px; text-align: center; }
  .sig img { max-height: 48px; max-width: 140px; }
  .total { margin-top: 14px; font-size: 13px; }
  .total b { color: ${BLEU}; }
  .note { margin-top: 16px; font-size: 10px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">MYSTORY</div>
      <div class="muted">Organisme de formation — NDA 11756521775 (ne vaut pas agrément de l'État)</div>
    </div>
    <div class="muted" style="text-align:right">
      Lieu de formation<br><b style="color:#0f172a">Gagny</b><br>3 bis av. de Gagny, 93220
    </div>
  </div>

  <h1>Feuille d'émargement</h1>
  <div class="meta">
    <div><span class="label">Stagiaire</span> <b>${esc(stagiaire)}</b></div>
    <div><span class="label">Formation</span> ${esc(certif)}</div>
    ${edof ? `<div><span class="label">Dossier EDOF</span> ${esc(edof)}</div>` : ""}
  </div>

  <table>
    <thead><tr>
      <th>Date</th><th>Demi-journée</th><th>Durée</th>
      <th>Signature stagiaire</th><th>Signature formatrice</th><th>Émargé le (Europe/Paris)</th>
    </tr></thead>
    <tbody>${lignes.join("")}</tbody>
  </table>

  <div class="total">Total des heures <b>réellement émargées</b> : <b>${nombreFR(total)} h</b> · ${seances.length} demi-journée(s)</div>

  <div class="note">
    Cette feuille reflète exclusivement les demi-journées <b>réellement émargées</b> (signature du stagiaire ET de la formatrice, recueillies en présentiel).
    Chaque émargement est horodaté au moment du dépôt (fuseau Europe/Paris) — aucune signature n'est pré-remplie, pré-datée ni pré-signée.
    Document généré le ${genereLe}.
  </div>
</body></html>`;

  return { html, nbSeances: seances.length, totalHeures: total };
}
