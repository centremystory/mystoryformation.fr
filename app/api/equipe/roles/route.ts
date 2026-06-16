// app/api/equipe/roles/route.ts — Rôles & fonctions de l'équipe (LECTURE SEULE).
// Affiché sur la page Équipe, ouverte à toute l'équipe (middleware global).
//
// ⚠️ Confidentialité : on n'expose QUE prénom + nom + rôle + statut.
// JAMAIS l'email ni le hash de mot de passe — la gestion des comptes reste sur /comptes (Direction).
// Aucune mutation ici : la création/modification de compte se fait via /api/comptes (action sensible).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ordre d'affichage des fonctions (encadrement d'abord, puis terrain).
const ORDRE: Record<string, number> = {
  direction: 0,
  pedagogie: 1,
  secretariat: 2,
  communication: 3,
  formatrice: 4,
  commercial: 5,
};

export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from("utilisateurs")
    .select("id, prenom, nom, role, actif") // pas d'email, pas de hash
    .order("actif", { ascending: false })
    .order("nom");
  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  const membres = (data ?? []).slice().sort((a: any, b: any) => {
    if (a.actif !== b.actif) return a.actif ? -1 : 1;
    const oa = ORDRE[a.role] ?? 99, ob = ORDRE[b.role] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(a.nom ?? "").localeCompare(String(b.nom ?? ""));
  });

  return NextResponse.json({ ok: true, membres });
}
