/**
 * MYSTORY — Page « Suivi du dossier » (lecture seule, publique par jeton)
 * ----------------------------------------------------------------------
 * GET /suivi?token=<dossiers.token>
 *
 * Affiche l'état complet d'un dossier : stagiaire, financement, niveaux, heures,
 * dates, et la check-list des 12 pièces obligatoires avec leur statut, plus les
 * jalons clés (contractualisation, signature, clôture, service fait).
 *
 * Accès : capability par jeton (uuid non devinable), comme /evaluation et /fiche-besoin.
 * Lecture seule — aucune écriture. Le service_role est utilisé côté serveur uniquement,
 * scoped strictement au dossier correspondant au jeton.
 *
 * Cette route N'EST PAS sous /api/documents ni /api/conventions → publique (cf. middleware).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLEU = "#2F72DE";

// Libellés des pièces (catalogue MYSTORY)
const LIBELLE_PIECE: Record<string, string> = {
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  evaluation_initiale: "Évaluation initiale",
  convention: "Convention (+ annexes)",
  programme: "Programme (annexe 1)",
  reglement_interieur: "Règlement intérieur (annexe 2)",
  planning: "Planning (annexe 3)",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement",
  evaluation_finale: "Évaluation finale",
  satisfaction_chaud: "Satisfaction à chaud",
  attestation_fin: "Attestation de fin",
  certificat_realisation: "Certificat de réalisation",
  satisfaction_froid: "Satisfaction à froid (3 mois)",
  justificatif_participation: "Justificatif participation forfaitaire",
};

// Statut d'une pièce → libellé + couleur
const STATUT_PIECE: Record<string, { label: string; bg: string; fg: string }> = {
  manquant: { label: "À faire", bg: "#EEEDEA", fg: "#5F5E5A" },
  genere: { label: "Généré", bg: "#E6F1FB", fg: "#0C447C" },
  envoye_a_signer: { label: "Envoyé à signer", bg: "#FAEEDA", fg: "#854F0B" },
  signature_en_cours: { label: "Signature en cours", bg: "#FAEEDA", fg: "#854F0B" },
  signee: { label: "Signé", bg: "#EAF3DE", fg: "#27500A" },
  erreur_envoi: { label: "Erreur d'envoi", bg: "#FCEBEB", fg: "#791F1F" },
};

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dateFR(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return esc(d);
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function page(title: string, body: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { --bleu:${BLEU}; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         color:#1f2430; background:#f4f6fb; line-height:1.5; }
  .wrap { max-width:840px; margin:0 auto; padding:24px 16px 64px; }
  .head { background:var(--bleu); color:#fff; border-radius:14px; padding:20px 22px; }
  .head h1 { margin:0 0 4px; font-size:20px; font-weight:600; }
  .head .sub { opacity:.92; font-size:14px; }
  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
  .banner { margin:16px 0; padding:12px 16px; border-radius:10px; font-size:14px; }
  .banner.inc { background:#FAEEDA; color:#854F0B; }
  .banner.ok { background:#EAF3DE; color:#27500A; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:16px 0; }
  .card { background:#fff; border:1px solid #e6e9f0; border-radius:12px; padding:14px 16px; }
  .card .k { font-size:12px; color:#6b7280; margin-bottom:3px; }
  .card .v { font-size:15px; font-weight:600; }
  h2 { font-size:16px; margin:24px 0 10px; }
  .steps { background:#fff; border:1px solid #e6e9f0; border-radius:12px; overflow:hidden; }
  .step { display:flex; align-items:center; gap:12px; padding:12px 16px; border-top:1px solid #f0f2f7; }
  .step:first-child { border-top:none; }
  .step .n { width:24px; height:24px; flex:0 0 24px; border-radius:50%; background:#eef1f7; color:#6b7280;
             font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center; }
  .step .lbl { flex:1; font-size:14px; }
  .step .opt { color:#9aa1ad; font-size:12px; font-weight:400; }
  table.pl { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e6e9f0; border-radius:12px; overflow:hidden; }
  table.pl th, table.pl td { text-align:left; padding:9px 14px; font-size:14px; border-top:1px solid #f0f2f7; }
  table.pl th { background:#f7f9fc; font-size:12px; color:#6b7280; font-weight:600; border-top:none; }
  .foot { margin-top:28px; color:#9aa1ad; font-size:12px; text-align:center; }
  @media print { body { background:#fff; } .card,.steps,table.pl { border-color:#ccc; } }
</style></head><body><div class="wrap">${body}
<div class="foot">MYSTORY — suivi interne du dossier · lecture seule · généré le ${dateFR(new Date().toISOString())}</div>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function notFound(): Response {
  return new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dossier introuvable</title></head>` +
      `<body style="font-family:sans-serif;max-width:560px;margin:80px auto;padding:0 16px;color:#1f2430">` +
      `<h1 style="color:${BLEU}">Dossier introuvable</h1>` +
      `<p>Ce lien de suivi n'est pas valide ou le dossier n'existe plus.</p></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return notFound();

  // Dossier + stagiaire
  const { data: dossier, error } = await supabaseAdmin
    .from("dossiers")
    .select("*, stagiaires(*)")
    .eq("token", token)
    .maybeSingle();
  if (error || !dossier) return notFound();

  const [{ data: pieces }, { data: planning }] = await Promise.all([
    supabaseAdmin.from("pieces").select("type,statut,optionnelle,ordre").eq("dossier_id", dossier.id).order("ordre"),
    supabaseAdmin.from("planning").select("date_seance,demi_journee,heures").eq("dossier_id", dossier.id).order("date_seance"),
  ]);

  const s = (dossier as any).stagiaires || {};
  const nomComplet = `${esc(s.prenom)} ${esc(s.nom)}`.trim() || "—";

  const niveau = `${esc(dossier.niveau_initial) || "?"} → ${esc(dossier.niveau_vise) || "?"}` +
    (dossier.niveau_atteint ? ` (atteint : ${esc(dossier.niveau_atteint)})` : "");
  const heures = `${esc(dossier.heures_prevues)} h prévues` +
    (dossier.heures_realisees !== null && dossier.heures_realisees !== undefined
      ? ` · ${esc(dossier.heures_realisees)} h réalisées`
      : "");

  const statutDossier = dossier.statut === "complet"
    ? `<span class="badge" style="background:#EAF3DE;color:#27500A">Complet</span>`
    : `<span class="badge" style="background:#FAEEDA;color:#854F0B">Incomplet</span>`;

  // Bannière d'état
  let banner = "";
  if (dossier.service_fait_valide) {
    banner = `<div class="banner ok">Service fait validé — prêt pour le certificat de réalisation et la facturation.</div>`;
  } else if (dossier.statut === "complet") {
    banner = `<div class="banner ok">Dossier complet : toutes les pièces obligatoires sont présentes.</div>`;
  } else {
    banner = `<div class="banner inc">Dossier en cours : certaines pièces restent à produire ou à compléter.</div>`;
  }

  // Cartes de synthèse
  const cards = [
    ["Certification", dossier.certif === "TEF_IRN" ? "TEF IRN (RS6775)" : dossier.certif === "LEVELTEL" ? "LEVELTEL (RS6427)" : esc(dossier.certif)],
    ["Financement", esc(dossier.financement)],
    ["Montant", `${esc(dossier.montant)} €` + (dossier.reste_a_charge_accepte ? " (reste à charge accepté)" : "")],
    ["Niveau (CECRL)", niveau],
    ["Durée", heures],
    ["N° dossier EDOF", esc(dossier.numero_edof) || "—"],
    ["Validation commande", dateFR(dossier.date_validation_commande)],
    ["1re séance", dateFR(dossier.date_debut)],
    ["Dernière séance", dateFR(dossier.date_fin)],
  ].map(([k, v]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join("");

  // Check-list des pièces
  const steps = (pieces || []).map((p: any) => {
    const lib = LIBELLE_PIECE[p.type] || p.type;
    const st = STATUT_PIECE[p.statut] || { label: p.statut, bg: "#EEEDEA", fg: "#5F5E5A" };
    return `<div class="step">
      <div class="n">${esc(p.ordre)}</div>
      <div class="lbl">${esc(lib)}${p.optionnelle ? ' <span class="opt">(optionnelle)</span>' : ""}</div>
      <span class="badge" style="background:${st.bg};color:${st.fg}">${esc(st.label)}</span>
    </div>`;
  }).join("");

  // Planning
  const HORAIRES: Record<string, string> = { matin: "9h30–12h30", apres_midi: "14h–17h" };
  const planningRows = (planning || []).map((pl: any) =>
    `<tr><td>${dateFR(pl.date_seance)}</td><td>${pl.demi_journee === "matin" ? "Matin" : "Après-midi"} (${HORAIRES[pl.demi_journee] || ""})</td><td>${esc(pl.heures)} h</td></tr>`
  ).join("");
  const planningBloc = planningRows
    ? `<h2>Planning des séances</h2><table class="pl"><thead><tr><th>Date</th><th>Demi-journée</th><th>Heures</th></tr></thead><tbody>${planningRows}</tbody></table>`
    : "";

  const body = `
    <div class="head">
      <h1>Suivi du dossier — ${nomComplet}</h1>
      <div class="sub">${esc(s.email) || ""}${s.telephone ? " · " + esc(s.telephone) : ""} &nbsp;·&nbsp; ${statutDossier}</div>
    </div>
    ${banner}
    <div class="grid">${cards}</div>
    <h2>Pièces du dossier conforme</h2>
    <div class="steps">${steps}</div>
    ${planningBloc}
  `;
  return page(`Suivi — ${nomComplet}`, body);
}
