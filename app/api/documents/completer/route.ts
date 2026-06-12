/**
 * MYSTORY — /api/documents/completer  (pièces « à compléter »)
 * Le formulaire CRM fournit les champs de jugement humain ; le serveur fusionne avec la
 * fiche (lieu = Gagny forcé), rend le PDF, l'archive et passe la pièce en « généré ».
 *
 * GET  ?dossier=<uuid>&type=<piece>  → dernière saisie (pré-remplissage du formulaire)
 * POST { dossierId, type, champs, auteur? }
 *
 * Types : fiche_analyse_besoin · evaluation_finale
 * Verrous :
 *  - fiche_analyse_besoin : la cohérence durée/écart de niveau DOIT être vérifiée (case obligatoire) ;
 *    l'objectif principal est nécessairement professionnel (anti-démarchage CPF).
 *  - evaluation_finale : interdite avant la dernière séance (anti-antidate) ; le niveau global
 *    saisi met à jour dossiers.niveau_atteint → l'attestation de fin reprend EXACTEMENT ce niveau
 *    (cohérence des niveaux CECRL, une seule source de vérité).
 */
import { NextRequest, NextResponse } from "next/server";
import { mergeTemplate, FicheStagiaire } from "@/lib/mergeEngine";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getFiche, archiveDocument, setPieceStatus, getSignedUrl } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const COMPLETABLES = new Set(["fiche_analyse_besoin", "evaluation_finale"]);
const NIVEAUX = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
const COCHE = "☑";
const VIDE = "☐";

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function dateFinISO(fiche: FicheStagiaire): string | null {
  const dates = (fiche.planning ?? []).map((s) => s.date).filter(Boolean) as string[];
  if (dates.length > 0) return [...dates].sort().slice(-1)[0];
  return fiche.dateFin ?? null;
}
const box = (on: boolean) => (on ? COCHE : VIDE);

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }
  const dossier = req.nextUrl.searchParams.get("dossier")?.trim();
  const type = req.nextUrl.searchParams.get("type")?.trim();
  if (!dossier || !type) return NextResponse.json({ ok: false, erreur: "Paramètres requis : dossier et type." }, { status: 400 });
  const { data } = await supabaseAdmin
    .from("completions").select("champs, auteur, horodatage")
    .eq("dossier_id", dossier).eq("piece_type", type).maybeSingle();
  return NextResponse.json({ ok: true, completion: data ?? null });
}

export async function POST(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const dossierId = String(body?.dossierId ?? "").trim();
  const type = String(body?.type ?? "").trim();
  const champs = body?.champs ?? {};
  const auteur = String(body?.auteur ?? "").trim() || null;

  if (!dossierId || !COMPLETABLES.has(type)) {
    return NextResponse.json({ ok: false, erreur: "dossierId et type (fiche_analyse_besoin | evaluation_finale) requis." }, { status: 400 });
  }

  let fiche = await getFiche(dossierId);
  if (!fiche) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const recap: string[] = [];
  let extras: Record<string, string | null> = { auteur_completion: auteur };
  let champsValides: Record<string, unknown> = {};

  if (type === "fiche_analyse_besoin") {
    const objectif = String(champs.objectif ?? "");
    const projet = String(champs.projet ?? "").trim();
    const apport = String(champs.apport_francais ?? "").trim();
    const compensation = String(champs.compensation ?? "non");
    const compDetail = String(champs.compensation_detail ?? "").trim();
    const coherence = champs.coherence === true;

    if (!["emploi", "maintien", "mobilite"].includes(objectif))
      recap.push("Objectif principal à choisir (nécessairement professionnel — règle CPF).");
    if (!projet) recap.push("Description du projet professionnel obligatoire.");
    if (!apport) recap.push("« En quoi la maîtrise du français sert ce projet » est obligatoire.");
    if (compensation === "oui" && !compDetail) recap.push("Besoin de compensation coché « Oui » : précision obligatoire.");
    if (!coherence) recap.push("La cohérence durée / écart de niveau doit être vérifiée et cochée avant de générer la fiche.");
    if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

    extras = {
      ...extras,
      obj_emploi: box(objectif === "emploi"),
      obj_maintien: box(objectif === "maintien"),
      obj_mobilite: box(objectif === "mobilite"),
      projet,
      apport_francais: apport,
      comp_non: box(compensation !== "oui"),
      comp_oui: box(compensation === "oui"),
      compensation_detail: compensation === "oui" ? compDetail : null,
      est_a0: box(fiche.niveauInitial === "A0"),
      est_a1: box(fiche.niveauInitial === "A1"),
      est_a2: box(fiche.niveauInitial === "A2"),
      est_b1: box(fiche.niveauInitial === "B1"),
      est_b2: box(fiche.niveauInitial === "B2"),
      vise_a2: box(fiche.niveauVise === "A2"),
      vise_b1: box(fiche.niveauVise === "B1"),
      vise_b2: box(fiche.niveauVise === "B2"),
    };
    champsValides = { objectif, projet, apport_francais: apport, compensation, compensation_detail: compDetail, coherence };
  }

  if (type === "evaluation_finale") {
    // Anti-antidate : pas d'évaluation finale avant la dernière séance.
    const fin = dateFinISO(fiche);
    if (!fin) recap.push("Date de fin introuvable (aucune séance au planning).");
    else if (fin > aujourdHuiParisISO())
      recap.push(`La formation se termine le ${fin} : impossible de réaliser l'évaluation finale avant cette date (anti-antidate).`);

    const niveaux: Record<string, string> = {};
    for (const c of ["co", "ce", "eo", "ee"]) {
      const v = String(champs[`niveau_${c}`] ?? "");
      if (!NIVEAUX.includes(v)) recap.push(`Niveau ${c.toUpperCase()} à renseigner (A0 → C2).`);
      niveaux[c] = v;
    }
    const global = String(champs.niveau_global ?? "");
    if (!NIVEAUX.includes(global)) recap.push("Niveau global atteint à renseigner (A0 → C2).");
    const commentaires = String(champs.commentaires ?? "").trim();
    const axes = String(champs.axes ?? "").trim();
    if (recap.length > 0) return NextResponse.json({ ok: false, status: "gate_ko", recap }, { status: 409 });

    // Cohérence des niveaux : le niveau global saisi devient LE niveau du dossier
    // (l'attestation de fin le reprend tel quel — une seule source de vérité).
    const { error: majErr } = await supabaseAdmin
      .from("dossiers").update({ niveau_atteint: global }).eq("id", dossierId);
    if (majErr) return NextResponse.json({ ok: false, erreur: majErr.message }, { status: 500 });
    fiche = (await getFiche(dossierId))!; // fiche fraîche → objectifs_atteints calculés sur le bon niveau

    for (const c of ["co", "ce", "eo", "ee"]) {
      for (const lvl of NIVEAUX) {
        extras[`g_${c}_${lvl.toLowerCase()}`] = box(niveaux[c] === lvl);
      }
    }
    extras.niveau_global = global;
    extras.commentaires = commentaires; // chaîne vide acceptée (rendu blanc, jamais « À COMPLÉTER »)
    extras.axes = axes;
    champsValides = { ...Object.fromEntries(Object.entries(niveaux).map(([k, v]) => [`niveau_${k}`, v])), niveau_global: global, commentaires, axes };
  }

  // Trace de la saisie (horodatage serveur, upsert : la dernière complétion fait foi)
  const { error: compErr } = await supabaseAdmin
    .from("completions")
    .upsert({ dossier_id: dossierId, piece_type: type, champs: champsValides, auteur }, { onConflict: "dossier_id,piece_type" });
  if (compErr) return NextResponse.json({ ok: false, erreur: compErr.message }, { status: 500 });

  const merge = mergeTemplate(type, fiche, extras);
  if (merge.missing.length > 0) {
    return NextResponse.json(
      { ok: false, status: "champs_manquants", recap: merge.missing.map((m) => `Champ requis manquant : ${m}`) },
      { status: 409 },
    );
  }

  try {
    await renderHtmlToPdf({ html: merge.html, name: `${type} — ${fiche.prenom} ${fiche.nom}` }).then(async ({ pdf }) => {
      await archiveDocument({ dossierId, piece: type, variant: "genere", pdf, generatedAt: new Date().toISOString() });
      await setPieceStatus({ dossierId, piece: type, status: "genere", at: new Date().toISOString() });
    });
    const pdfUrl = await getSignedUrl(`${dossierId}/${type}_genere.pdf`, 3600);
    return NextResponse.json({ ok: true, dossierId, type, status: "genere", pdfUrl });
  } catch (e) {
    await setPieceStatus({ dossierId, piece: type, status: "erreur_envoi", at: new Date().toISOString() });
    return NextResponse.json({ ok: false, status: "erreur", erreur: String(e) }, { status: 502 });
  }
}
