/**
 * MYSTORY — GET /api/dossiers/export-zip?dossier=<id>
 * « Dossier conforme 1 clic » : assemble les pièces archivées d'UN stagiaire dans l'ordre
 * exact du dossier conforme et renvoie un ZIP (un dossier = un stagiaire = une archive).
 * La version signée prime sur la générée. Lecture seule.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFiche } from "@/lib/crm";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "documents";

// Ordre exact du dossier conforme (en audit).
const ORDRE = [
  "fiche_analyse_besoin", "evaluation_initiale", "convention",
  "programme", "reglement_interieur", "planning",
  "convocation", "feuille_emargement", "evaluation_finale",
  "satisfaction_chaud", "attestation_fin", "certificat_realisation",
  "justificatif_participation", "justificatif_examen",
];
const LABEL: Record<string, string> = {
  fiche_analyse_besoin: "Fiche_analyse_besoin", evaluation_initiale: "Evaluation_initiale",
  convention: "Convention", programme: "Programme_A1", reglement_interieur: "Reglement_interieur_A2",
  planning: "Planning_A3", convocation: "Convocation", feuille_emargement: "Feuille_emargement",
  evaluation_finale: "Evaluation_finale", satisfaction_chaud: "Satisfaction", attestation_fin: "Attestation_fin",
  certificat_realisation: "Certificat_realisation", justificatif_participation: "Justificatif_participation",
  justificatif_examen: "Justificatif_examen",
};

function slug(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "stagiaire";
}

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  const id = req.nextUrl.searchParams.get("dossier")?.trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "Paramètre 'dossier' requis." }, { status: 400 });

  const fiche = await getFiche(id);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });
  const f = fiche as unknown as { nom: string; prenom?: string };

  // Pièces archivées : signé > généré, une entrée par type.
  const { data: arch, error } = await supabaseAdmin
    .from("archives").select("piece_type, variant, url").eq("dossier_id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  if (!arch || arch.length === 0) {
    return NextResponse.json({ ok: false, erreur: "Aucun document archivé pour ce dossier." }, { status: 409 });
  }
  const meilleure = new Map<string, { piece_type: string; variant: string; url: string }>();
  for (const a of arch as any[]) {
    const prev = meilleure.get(a.piece_type);
    if (!prev || (a.variant === "signe" && prev.variant !== "signe")) meilleure.set(a.piece_type, a);
  }

  // Tri selon l'ordre du dossier conforme (types inconnus à la fin).
  const ordonnees = [...meilleure.values()].sort((a, b) => {
    const ia = ORDRE.indexOf(a.piece_type); const ib = ORDRE.indexOf(b.piece_type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const zip = new JSZip();
  let n = 0;
  const manquantes: string[] = [];
  for (const a of ordonnees) {
    try {
      const dl = await supabaseAdmin.storage.from(BUCKET).download(a.url);
      if (dl.error || !dl.data) { manquantes.push(a.piece_type); continue; }
      const buf = Buffer.from(await dl.data.arrayBuffer());
      n += 1;
      // Extension RÉELLE du fichier archivé (un justificatif/scan peut être .jpg/.png, pas .pdf) :
      // forcer .pdf le rendait illisible après renommage.
      const ext = (a.url.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      const nom = `${String(n).padStart(2, "0")}_${LABEL[a.piece_type] ?? slug(a.piece_type)}.${ext}`;
      zip.file(nom, buf);
    } catch { manquantes.push(a.piece_type); }
  }
  if (n === 0) return NextResponse.json({ ok: false, erreur: "Aucun PDF lisible à archiver." }, { status: 409 });

  // Petit index lisible dans le ZIP.
  const index = [
    `Dossier conforme — ${f.prenom ?? ""} ${f.nom}`.trim(),
    `Généré le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    "",
    "Pièces incluses (ordre du dossier conforme) :",
    ...ordonnees.filter((a) => !manquantes.includes(a.piece_type)).map((a, i) => `  ${String(i + 1).padStart(2, "0")}. ${LABEL[a.piece_type] ?? a.piece_type}${a.variant === "signe" ? " (signé)" : ""}`),
    manquantes.length ? `\nNon disponibles : ${manquantes.join(", ")}` : "",
  ].join("\n");
  zip.file("00_SOMMAIRE.txt", index);

  const contenu = await zip.generateAsync({ type: "nodebuffer" });
  const fichier = `Dossier_${slug(f.nom)}_${slug(f.prenom ?? "")}.zip`.replace(/_\.zip$/, ".zip");

  return new NextResponse(new Uint8Array(contenu), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
