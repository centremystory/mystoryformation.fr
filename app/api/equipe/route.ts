// app/api/equipe/route.ts — Gestion de l'équipe de formateurs
// Liste, ajout, activation/désactivation. Protégé par le middleware global (mot de passe d'équipe).
//
// ⚠️ Règle MYSTORY : AUCUN handler DELETE n'existe ici, et c'est volontaire.
// Un formateur qui a signé des émargements doit rester consultable 5 ans (RGPD / audit Qualiopi-CDC).
// La suppression casserait la traçabilité des anciens dossiers → on DÉSACTIVE, on ne supprime jamais.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "documents";

type Formatrice = {
  id: string;
  nom: string;
  prenom: string | null;
  justificatif_fle: boolean;
  justificatif_url: string | null;
  justificatif_date: string | null;
  actif: boolean;
  created_at: string;
};

/** Liste complète de l'équipe (actifs + inactifs), avec URL signée 1 h vers la pièce FLE. */
export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("formatrices")
    .select("id, nom, prenom, justificatif_fle, justificatif_url, justificatif_date, actif, created_at")
    .order("actif", { ascending: false })
    .order("nom");
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  // Bucket privé → URL signée temporaire (1 h) pour consulter la pièce, jamais d'URL publique.
  const formatrices = await Promise.all(
    (data as Formatrice[]).map(async (f) => {
      let lien: string | null = null;
      if (f.justificatif_url) {
        const { data: signe } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(f.justificatif_url, 3600);
        lien = signe?.signedUrl ?? null;
      }
      return { ...f, justificatif_lien: lien };
    })
  );

  return NextResponse.json({ ok: true, formatrices });
}

/** Ajout d'un formateur — nom + prénom. Arrive en ⏳ (justificatif manquant) et actif. */
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const nom = String(body?.nom ?? "").trim();
  const prenom = String(body?.prenom ?? "").trim();
  if (!nom || !prenom) {
    return NextResponse.json({ ok: false, erreur: "Nom et prénom sont obligatoires." }, { status: 400 });
  }

  // Anti-doublon (insensible à la casse) sur nom + prénom
  const { data: existants, error: errDoublon } = await supabaseAdmin
    .from("formatrices")
    .select("id")
    .ilike("nom", nom)
    .ilike("prenom", prenom);
  if (errDoublon) {
    return NextResponse.json({ ok: false, erreur: errDoublon.message }, { status: 500 });
  }
  if (existants && existants.length > 0) {
    return NextResponse.json(
      { ok: false, erreur: `${prenom} ${nom} existe déjà dans l'équipe (réactive sa fiche si besoin).` },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("formatrices")
    .insert({ nom, prenom }) // justificatif_fle=false et actif=true par défaut (côté base)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, formatrice: data });
}

/** Activation / désactivation — la seule "sortie" possible (jamais de suppression). */
export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const actif = body?.actif;
  if (!id || typeof actif !== "boolean") {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : id (uuid) et actif (booléen)." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("formatrices")
    .update({ actif })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, erreur: error?.message ?? "Formateur introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, formatrice: data });
}
