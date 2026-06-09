/**
 * MYSTORY — POST /api/positionnement  (PUBLIC, sans session)
 * Reçoit le résultat du test de positionnement (QCM d'accueil) et l'enregistre comme
 * « prospect » dans la table positionnements (aucun dossier requis à ce stade).
 *
 * Public par dessein : le QCM est rempli à l'accueil par un candidat non connecté
 * (le formateur ajoute EE/EO + remarques sur le même écran). N'EST PAS couvert par le
 * middleware d'auth (matcher limité à /api/documents/* et /api/conventions/*).
 *
 * Anti-abus (léger, MVP) :
 *  - Si POSITIONNEMENT_INGEST_KEY est défini en env, l'en-tête x-mystory-key doit correspondre.
 *    (Clé visible côté page = simple garde-fou ; durcissement réel = rate-limit/CAPTCHA plus tard.)
 *  - Validation de forme + bornes des notes ; champs texte tronqués.
 *
 * CORS ouvert (capture de lead public) : fonctionne que le QCM soit servi en same-origin
 * (public/ de l'app) ou hébergé ailleurs (site MYSTORY).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const NIVEAUX = new Set(["A0", "A1", "A2", "B1", "B2", "C1", "C2"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-mystory-key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Coupe une chaîne à n caractères (protège la base des payloads géants). */
function clip(v: unknown, n: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, n) : null;
}

/** Note numérique bornée [0, max] ou null. */
function num(v: unknown, max: number): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > max) return null;
  return n;
}

export async function POST(req: NextRequest) {
  // Garde-fou optionnel par clé d'ingestion.
  const expected = process.env.POSITIONNEMENT_INGEST_KEY;
  if (expected && req.headers.get("x-mystory-key") !== expected) {
    return json({ ok: false, error: "Clé d'ingestion invalide." }, 401);
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "JSON invalide." }, 400);
  }

  const nom = clip(b.nom, 120);
  const prenom = clip(b.prenom, 120);
  const email = clip(b.email, 200);
  const telephone = clip(b.telephone, 40);

  // Identité minimale : nom + prénom, et au moins un moyen de contact.
  if (!nom || !prenom) {
    return json({ ok: false, error: "Nom et prénom requis." }, 422);
  }
  if (!email && !telephone) {
    return json({ ok: false, error: "Au moins un email ou un téléphone requis." }, 422);
  }

  const niveauVise = clip(b.niveau_vise, 4);
  const niveauGlobal = clip(b.niveau_global, 4);
  if (niveauGlobal && !NIVEAUX.has(niveauGlobal)) {
    return json({ ok: false, error: `Niveau global invalide : ${niveauGlobal}.` }, 422);
  }

  const row = {
    certif: clip(b.certif, 20) ?? "TEF_IRN",
    nom,
    prenom,
    telephone,
    email,
    niveau_vise: niveauVise,
    referent: clip(b.referent, 120),
    ce_sur20: num(b.ce_sur20, 20),
    co_sur10: num(b.co_sur10, 10),
    ee_sur10: num(b.ee_sur10, 10),
    eo_sur10: num(b.eo_sur10, 10),
    total_sur20: num(b.total_sur20, 20),
    niveau_global: niveauGlobal,
    dispos: clip(b.dispos, 400),
    remarques: clip(b.remarques, 4000),
    ecrit: clip(b.ecrit, 8000),
    source: "qcm",
  };

  const { data, error } = await supabaseAdmin
    .from("positionnements")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    return json({ ok: false, error: "Enregistrement impossible." }, 502);
  }

  return json({ ok: true, id: data.id });
}
