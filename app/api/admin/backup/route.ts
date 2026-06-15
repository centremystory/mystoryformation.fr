/**
 * MYSTORY — /api/admin/backup
 * Sauvegarde LOGIQUE de la base (export JSON de toutes les tables), hors-Supabase.
 * GET  → télécharge un ZIP (un .json par table) + manifest. (Direction)
 * POST → construit le ZIP et l'ENVOIE par email à contact@ (pour le cron n8n hebdo).
 * NB : ne sauvegarde PAS les fichiers du bucket (PDF signés) — voir note manifest.
 *      Le hash des mots de passe est expurgé (sécurité). Plan gratuit = pas de PITR managé.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";
import { journal } from "@/lib/examens";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DESTINATAIRE = process.env.BACKUP_EMAIL ?? "contact@mystoryformation.fr";

// Toutes les tables métier (rate_buckets = état transitoire, exclu).
const TABLES = [
  "stagiaires", "dossiers", "pieces", "archives", "planning",
  "ventes_examen", "examens", "sessions_examen", "resultats_examen", "attestations_tef",
  "corrections", "remboursements_examen", "liste_attente_examen",
  "factures", "sous_traitance", "bpf_depots", "imports_edof", "dossiers_edof",
  "formatrices", "formateurs", "formateur_documents", "formateur_questionnaire", "commerciaux",
  "utilisateurs", "conges", "planning_employes", "pointages", "taches",
  "veille", "faq", "satisfactions", "satisfaction_seance", "contenu_pedagogique",
  "programmes", "programme_modules", "positionnements", "messages_prospects",
  "incidents_techniques", "remarques", "formules", "completions",
  "webhook_events", "journal", "classement_cache",
];

const estDirection = (u: SessionUser) => !u.role || u.role === "staff" || u.role === "direction";

async function dumpTable(t: string): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from(t).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${t}: ${error.message}`);
    const rows = data ?? [];
    // Sécurité : ne jamais exporter les hash de mots de passe.
    for (const r of rows as any[]) { if ("mot_de_passe_hash" in r) r.mot_de_passe_hash = "[expurgé]"; }
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function construireZip(): Promise<{ buffer: Buffer; resume: Record<string, number>; total: number }> {
  const zip = new JSZip();
  const resume: Record<string, number> = {};
  let total = 0;
  for (const t of TABLES) {
    try {
      const rows = await dumpTable(t);
      zip.file(`${t}.json`, JSON.stringify(rows, null, 2));
      resume[t] = rows.length; total += rows.length;
    } catch (e: any) {
      zip.file(`${t}.ERREUR.txt`, String(e?.message ?? e));
      resume[t] = -1;
    }
  }
  const dateIso = new Date().toISOString();
  const manifest = {
    produit: "MYSTORY CRM — sauvegarde logique",
    genere_le: dateIso,
    tables: resume,
    total_lignes: total,
    notes: [
      "Export JSON des données. Pour restaurer : réinsérer les lignes table par table (respecter l'ordre des dépendances).",
      "Les fichiers du bucket 'documents' (PDF signés) ne sont PAS inclus ici — ils restent dans Supabase Storage.",
      "Les hash de mots de passe sont expurgés : à la restauration, réinitialiser les mots de passe via /comptes.",
      "Plan gratuit Supabase = pas de PITR managé. Cette sauvegarde est un filet ; le plan Pro reste recommandé pour la restauration à un instant T.",
    ],
  };
  zip.file("00_MANIFEST.json", JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, resume, total };
}

function nomFichier(): string {
  const d = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  return `mystory_backup_${d}.zip`;
}

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  if (!estDirection(u)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
  const { buffer } = await construireZip();
  await journal("systeme", null, "sauvegarde_telechargee", { par: u.email ?? null }, u.email ?? null);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomFichier()}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const u = await garde(req); if (u instanceof NextResponse) return u;
  if (!estDirection(u)) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
  const { buffer, resume, total } = await construireZip();
  const fichier = nomFichier();

  if (!EMAIL_ACTIF) {
    return NextResponse.json({ ok: false, erreur: "Canal email inactif (SMTP non configuré)." }, { status: 503 });
  }
  const html = gabaritEmail(
    "Sauvegarde MYSTORY CRM",
    `<p>Sauvegarde automatique de la base MYSTORY CRM.</p>
     <p><strong>${total}</strong> lignes exportées sur <strong>${Object.keys(resume).length}</strong> tables, le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p>
     <p>Le fichier <code>${fichier}</code> est joint. Conservez-le hors de Supabase (mail, disque, cloud).</p>
     <p style="color:#6b7280;font-size:12px;">Rappel : les PDF du bucket et les hash de mots de passe ne sont pas inclus. Plan Pro recommandé pour la restauration à un instant T.</p>`,
  );
  const env = await envoyerEmail({
    a: DESTINATAIRE, objet: `Sauvegarde MYSTORY CRM — ${fichier}`,
    html, piecesJointes: [{ nom: fichier, contenu: buffer }],
    entite: "systeme", auteur: u.email ?? "backup-auto",
  });
  await journal("systeme", null, "sauvegarde_envoyee", { destinataire: DESTINATAIRE, total, ok: env.ok }, u.email ?? "backup-auto");
  if (!env.ok) return NextResponse.json({ ok: false, erreur: env.erreur ?? "Échec d'envoi." }, { status: 502 });
  return NextResponse.json({ ok: true, total, tables: Object.keys(resume).length, fichier });
}
