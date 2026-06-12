/**
 * MYSTORY — POST /api/satisfaction  (réponse du stagiaire, accès public par jeton)
 * Body : { token, type: "chaud"|"froid", reponses }
 * Sécurité : le jeton du dossier (uuid non devinable) est la capability — vérifié côté serveur.
 * Verrous : pas de réponse avant la fin de la formation (anti-antidate) · une seule réponse
 * par questionnaire (immuable, verrou aussi en base). Le PDF est archivé et la pièce passe
 * en « généré » (satisfaction_froid est créée en pièce OPTIONNELLE : elle n'empêche pas la
 * clôture du dossier, elle arrive 3 mois plus tard).
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate, FicheStagiaire } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { getFiche, archiveDocument, setPieceStatus } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const COCHE = "☑";
const VIDE = "☐";
const box = (on: boolean) => (on ? COCHE : VIDE);

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function aujourdHuiParisFR(): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}
function dateFinISO(fiche: FicheStagiaire): string | null {
  const dates = (fiche.planning ?? []).map((s) => s.date).filter(Boolean) as string[];
  if (dates.length > 0) return [...dates].sort().slice(-1)[0];
  return fiche.dateFin ?? null;
}
function note(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const token = String(body?.token ?? "").trim();
  const type = String(body?.type ?? "").trim();
  const reponses = body?.reponses ?? {};
  if (!token || (type !== "chaud" && type !== "froid")) {
    return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  }

  // Capability : le jeton EST l'autorisation — résolution côté serveur uniquement.
  const { data: dossier } = await supabaseAdmin
    .from("dossiers").select("id").eq("token", token).maybeSingle();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 404 });
  const dossierId = (dossier as any).id as string;

  const fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  // Anti-antidate : pas de satisfaction avant la fin réelle de la formation.
  const fin = dateFinISO(fiche);
  if (!fin || fin > aujourdHuiParisISO()) {
    return NextResponse.json(
      { ok: false, erreur: "Ce questionnaire sera disponible à la fin de votre formation." },
      { status: 409 },
    );
  }

  // Validation des réponses + balises du PDF
  const extras: Record<string, string | null> = { date_reponse: aujourdHuiParisFR() };
  const propres: Record<string, unknown> = {};
  const echelles: Array<[string, number, number]> =
    type === "chaud"
      ? [["nps", 0, 10], ["q_info", 1, 5], ["q_conditions", 1, 5], ["q_pedago", 1, 5], ["q_rythme", 1, 5], ["q_projet", 1, 5]]
      : [["nps", 0, 10], ["q_objectif", 1, 5], ["q_usage", 1, 5], ["q_besoins", 1, 5]];

  for (const [nom, min, max] of echelles) {
    const n = note(reponses[nom], min, max);
    if (n === null) return NextResponse.json({ ok: false, erreur: "Merci de répondre à toutes les questions notées." }, { status: 400 });
    propres[nom] = n;
    for (let i = min; i <= max; i++) extras[`${nom}_${i}`] = box(i === n);
  }

  if (type === "froid") {
    const examen = String(reponses.examen ?? "");
    const niveau = String(reponses.niveau_obtenu ?? "");
    const demarche = String(reponses.demarche ?? "");
    if (!["oui", "prevu", "pas_encore"].includes(examen) || !["A2", "B1", "B2", "attente"].includes(niveau) || !["oui", "en_cours", "non"].includes(demarche)) {
      return NextResponse.json({ ok: false, erreur: "Merci de répondre à toutes les questions." }, { status: 400 });
    }
    Object.assign(propres, { examen, niveau_obtenu: niveau, demarche });
    Object.assign(extras, {
      ex_oui: box(examen === "oui"), ex_prevu: box(examen === "prevu"), ex_pas_encore: box(examen === "pas_encore"),
      nv_a2: box(niveau === "A2"), nv_b1: box(niveau === "B1"), nv_b2: box(niveau === "B2"), nv_attente: box(niveau === "attente"),
      dm_oui: box(demarche === "oui"), dm_en_cours: box(demarche === "en_cours"), dm_non: box(demarche === "non"),
    });
  }

  const commentaire = String(reponses.commentaire ?? "").trim().slice(0, 2000);
  propres.commentaire = commentaire;
  extras.commentaire = commentaire; // chaîne vide → rendu blanc

  // Une seule réponse possible : l'INSERT échoue si déjà répondu (PK + trigger immuable).
  const { error: insErr } = await supabaseAdmin
    .from("satisfactions")
    .insert({ dossier_id: dossierId, type, reponses: propres });
  if (insErr) {
    const deja = insErr.code === "23505";
    return NextResponse.json(
      { ok: false, erreur: deja ? "Votre réponse a déjà été enregistrée — merci !" : insErr.message },
      { status: deja ? 409 : 500 },
    );
  }

  // PDF archivé + pièce mise à jour (en arrière-plan logique : la réponse est déjà sauvée).
  const pieceType = type === "chaud" ? "satisfaction_chaud" : "satisfaction_froid";
  try {
    // La pièce « satisfaction à froid » est créée si absente — OPTIONNELLE (post-clôture, 3 mois).
    const { data: piece } = await supabaseAdmin
      .from("pieces").select("type").eq("dossier_id", dossierId).eq("type", pieceType).maybeSingle();
    if (!piece) {
      await supabaseAdmin.from("pieces").insert({
        dossier_id: dossierId, type: pieceType, ordre: pieceType === "satisfaction_froid" ? 13 : 10,
        optionnelle: pieceType === "satisfaction_froid", statut: "manquant", exige_signature: false,
      });
    }

    const merge = mergeTemplate(pieceType, fiche, extras);
    const { pdf } = await renderHtmlToPdf({ html: merge.html, name: `${pieceType} — ${fiche.prenom} ${fiche.nom}` });
    await archiveDocument({ dossierId, piece: pieceType, variant: "genere", pdf, generatedAt: new Date().toISOString() });
    await setPieceStatus({ dossierId, piece: pieceType, status: "genere", at: new Date().toISOString() });
  } catch {
    // La réponse du stagiaire est sauvée quoi qu'il arrive ; le PDF pourra être régénéré côté équipe.
  }

  return NextResponse.json({ ok: true });
}
