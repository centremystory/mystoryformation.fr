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
import { estAutomate, estProprietaire } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";
import { journal } from "@/lib/examens";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 17/09/2026 — le courrier d'exploitation arrive au SECRÉTARIAT. `contact@` est
// réservé aux demandes entrantes des prospects et reste le point RGPD publié.
const DESTINATAIRE = process.env.BACKUP_EMAIL ?? "secretariat@mystoryformation.fr";

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

/**
 * AUTHENTIFICATION (qui appelle ?) — inchangee : `requireUser` exige un JWT valide
 * signe par AUTH_SECRET (cookie d equipe OU en-tete Bearer). Sans jeton valide : 401,
 * et le middleware global refuse deja la route en amont. Aucun acces anonyme.
 */
async function authentifier(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifie." }, { status: 401 });
    throw e;
  }
}

/**
 * AUTORISATION (a-t-il le DROIT d exporter la base ?) — volontairement PLUS STRICTE
 * que la garde par role generique, et plus stricte que ce que cette route faisait
 * avant le 09/10/2026.
 *
 * Ce que produit cette route : un export JSON de TOUTES les tables, soit l identite
 * complete de plus de mille candidats (nom, date et lieu de naissance, nationalite,
 * adresse, telephone, e-mail, numero de piece d identite). Donnee personnelle sensible
 * au sens du RGPD, sur un public dont le titre de sejour depend de nous. La garde doit
 * donc etre nominative, jamais « large par defaut ».
 *
 * 09/10/2026 — DEUX problemes DISTINCTS, corriges separement.
 *
 * 1) AUTORISATION TROP FERMEE pour l automate. Le jeton de service n8n etait refuse
 *    (403 « Reserve a la Direction. ») parce que la garde locale n acceptait que
 *    « aucun role », "staff" ou "direction", alors que ce jeton porte un role HORS
 *    matrice staff. Resultat : 4 dimanches de suite (13, 20, 27/09 et 04/10/2026),
 *    AUCUNE sauvegarde de la base, et aucune alerte n8n pour le signaler.
 *    -> on admet desormais l automate de confiance (`estAutomate`), comme /api/incidents.
 *
 * 2) AUTORISATION TROP OUVERTE pour les jetons SANS role. La garde d origine admettait
 *    tout jeton sans role (`!u.role`). Or `verifySession` ne verifie pas l audience du
 *    JWT : un jeton du portail PARTENAIRE (lib/prescripteurAuth — signe avec le MEME
 *    AUTH_SECRET, audience "prescripteur", payload sans role) presente dans un en-tete
 *    `Authorization: Bearer` ressort de `verifySession` comme une session d equipe sans
 *    role, et passait. Un partenaire pouvait donc exporter la base entiere. Ce defaut est
 *    ANTERIEUR a aujourd hui et n est PAS propre a cette route : il vient de
 *    `verifySession`, donc il vaut aussi pour requireRole (/api/incidents, /api/classement)
 *    et pour peutFacturer (/api/factures). Signale pour correction de fond.
 *    -> ici on le ferme tout de suite, en SUPPRIMANT le filet « aucun role ».
 *
 * Passent donc, et RIEN d autre :
 *   - le proprietaire (Arudhan), par e-mail exact ;
 *   - un compte portant le role "direction" ;
 *   - la session d equipe partagee "staff" (etat d avant, conserve pour ne pas casser
 *     le telechargement depuis le back-office) ;
 *   - un automate de confiance : JWT valide dont AUCUN role n appartient a la matrice
 *     staff. Un humain porte toujours un role de la matrice : l exemption ne peut donc
 *     pas etre usurpee en rejouant un cookie de session dans un en-tete Bearer.
 *
 * Sont REFUSES, y compris ce qui passait avant : tout jeton SANS role (jeton partenaire,
 * jeton ephemere du cron — qui ne vise pas cette route), et tout compte individuel dont
 * le role appartient a la matrice sans etre "direction".
 */
function autoriseExport(u: SessionUser): boolean {
  const rs = u.roles && u.roles.length > 0 ? u.roles : (u.role ? [u.role] : []);
  if (estProprietaire(u.email)) return true;
  if (rs.includes("direction") || rs.includes("staff")) return true;
  return estAutomate(rs); // faux sur une liste vide : aucun filet « sans role »
}

const refusExport = () => NextResponse.json(
  { ok: false, erreur: "Reserve a la Direction." },
  { status: 403 },
);

export async function GET(req: NextRequest) {
  const u = await authentifier(req); if (u instanceof NextResponse) return u;
  if (!autoriseExport(u)) return refusExport();
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
  const u = await authentifier(req); if (u instanceof NextResponse) return u;
  if (!autoriseExport(u)) return refusExport();
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
