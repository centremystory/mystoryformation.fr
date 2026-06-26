/**
 * MYSTORY — POST /api/positionnement  (PUBLIC : soumission du QCM candidat)
 * Enregistre un positionnement en statut "en_attente_formateur" (le candidat ne fait que
 * CE + CO ; EE/EO seront saisies par la formatrice en phase 2). Aucun dossier n'est créé
 * à ce stade (le pont A3 n'agit qu'au statut "complet").
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CIVILITES = new Set(["Madame", "Monsieur", "Autre"]);
const NIVEAUX_VISE = new Set(["A1", "A2", "B1", "B2"]);
const CERTIFS = new Set(["TEF_IRN", "LEVELTEL"]);

function clip(v: unknown, n: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, n) : null;
}
function num(v: unknown, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > max) return null;
  return n;
}

export async function POST(req: NextRequest) {
  // Anti-spam : formulaire de positionnement public (crée une fiche + jeton).
  if (await limiteDepassee(`positionnement:${ipDe(req)}`, 40, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de demandes. Réessayez plus tard." }, { status: 429 });
  }
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const nom = clip(b.nom, 120), prenom = clip(b.prenom, 120), email = clip(b.email, 200), telephone = clip(b.telephone, 40);
  if (!nom || !prenom) return NextResponse.json({ ok: false, erreur: "Nom et prénom requis." }, { status: 422 });
  if (!email && !telephone) return NextResponse.json({ ok: false, erreur: "Un email ou un téléphone est requis." }, { status: 422 });

  const civ = clip(b.civilite, 12);
  const certifRaw = clip(b.certif, 20);
  const nv = clip(b.niveau_vise, 4);
  const row = {
    certif: certifRaw && CERTIFS.has(certifRaw) ? certifRaw : "TEF_IRN",
    civilite: civ && CIVILITES.has(civ) ? civ : null,
    nom, prenom, telephone, email,
    adresse: clip(b.adresse, 200), cp: clip(b.cp, 10), ville: clip(b.ville, 120),
    niveau_vise: nv && NIVEAUX_VISE.has(nv) ? nv : null,
    referent: clip(b.referent, 120),
    ce_sur20: num(b.ce_sur20, 20), co_sur10: num(b.co_sur10, 10),
    dispos: clip(b.dispos, 400), remarques: clip(b.remarques, 4000),
    source: "qcm", statut: "en_attente_formateur",
  };

  const { data, error } = await supabaseAdmin.from("positionnements").insert(row).select("id, token").single();
  if (error || !data) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });
  return NextResponse.json({ ok: true, id: data.id, token: data.token });
}
