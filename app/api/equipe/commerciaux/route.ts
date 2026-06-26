// app/api/equipe/commerciaux/route.ts — Gestion des commerciaux de l'équipe
// Liste, ajout, activation/désactivation. Protégé par le middleware global (mot de passe d'équipe).
//
// ⚠️ Règle MYSTORY : AUCUN handler DELETE ici, et c'est volontaire (comme pour les formateurs).
// Un commercial ayant vendu des inscriptions doit rester consultable (traçabilité équipe).
// → on DÉSACTIVE (champ actif), on ne supprime jamais.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth";
import { peut } from "@/lib/roles";

type Commercial = {
  id: string;
  nom: string;
  prenom: string | null;
  actif: boolean;
  created_at: string;
};

/** Liste complète des commerciaux (actifs + inactifs). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("commerciaux")
    .select("id, nom, prenom, actif, created_at")
    .order("actif", { ascending: false })
    .order("nom");
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, commerciaux: data as Commercial[] });
}

/** Ajout d'un commercial — nom + prénom. Actif par défaut (côté base). */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  if (!peut(auth.roles ?? auth.role, "comptes_gerer")) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
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
    .from("commerciaux")
    .select("id")
    .ilike("nom", nom)
    .ilike("prenom", prenom);
  if (errDoublon) {
    return NextResponse.json({ ok: false, erreur: errDoublon.message }, { status: 500 });
  }
  if (existants && existants.length > 0) {
    return NextResponse.json(
      { ok: false, erreur: `${prenom} ${nom} existe déjà (réactive sa fiche si besoin).` },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("commerciaux")
    .insert({ nom, prenom }) // actif=true par défaut (côté base)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, commercial: data });
}

/** Activation / désactivation — la seule "sortie" possible (jamais de suppression). */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req).catch(() => null);
  if (!auth) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  if (!peut(auth.roles ?? auth.role, "comptes_gerer")) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const id = String(body?.id ?? "").trim();
  const actif = body?.actif;
  if (!id || typeof actif !== "boolean") {
    return NextResponse.json({ ok: false, erreur: "Paramètres requis : id (uuid) et actif (booléen)." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("commerciaux")
    .update({ actif })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, erreur: error?.message ?? "Commercial introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, commercial: data });
}
