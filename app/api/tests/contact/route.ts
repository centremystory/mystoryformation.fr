/**
 * Coordonnées laissées par le candidat à la fin du test de positionnement.
 *
 * 08/09/2026 — le test se passait sans qu'on sache toujours qui l'avait passé :
 * une passation depuis le site public pouvait n'avoir ni téléphone ni courriel, et
 * le prospect était perdu. Cette route complète la fiche APRÈS coup, une fois que
 * le candidat a vu son résultat — c'est le moment où il a le plus de raisons de
 * nous les donner.
 *
 * On ne remplace jamais une donnée déjà saisie par un conseiller : on ne comble
 * que les trous.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

const txt = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export async function POST(req: NextRequest) {
  if (await limiteDepassee(`tests-contact:${ipDe(req)}`, 20, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as any));
  const token = txt(body.token, 80);
  if (!token) return NextResponse.json({ ok: false, erreur: "Jeton manquant." }, { status: 400 });

  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, nom, prenom, email, telephone, objectif")
    .eq("token", token).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });

  const e = ev as any;
  // On ne comble que ce qui manque : un conseiller a pu saisir la fiche avant.
  const maj: Record<string, unknown> = {};
  const combler = (champ: string, valeur: string | null) => {
    if (valeur && !e[champ]) maj[champ] = valeur;
  };
  combler("nom", txt(body.nom, 120));
  combler("prenom", txt(body.prenom, 120));
  combler("email", txt(body.email, 200));
  combler("telephone", txt(body.telephone, 40));
  combler("objectif", txt(body.objectif, 1000));
  maj.rappel_souhaite = true;

  const { error } = await supabaseAdmin.from("evaluations").update(maj).eq("id", e.id);
  if (error) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });

  await journal("evaluation", e.id, "contact_candidat", { champs: Object.keys(maj) }, "candidat");
  return NextResponse.json({ ok: true });
}
