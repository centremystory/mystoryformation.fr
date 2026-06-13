/**
 * MYSTORY — GET /api/suivi-eleves
 * Agrège, par élève en formation (dossier ayant des séances), la progression :
 * heures faites (émargées), heures à venir, nombre d'absences, prochaine séance.
 * Lecture seule. Auth obligatoire. Lieu de formation : Gagny (l'agence sert au suivi par site).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try { await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  const { data, error } = await supabaseAdmin
    .from("planning")
    .select(`
      id, date_seance, heures, emarge_le, absence,
      dossier:dossiers!dossier_id ( id, certif, statut, heures_prevues,
        stagiaire:stagiaires!stagiaire_id ( prenom, nom, agence ) )
    `);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

  const map = new Map<string, any>();
  for (const r of data ?? []) {
    const d = (r as any).dossier;
    if (!d?.id) continue;
    if (!map.has(d.id)) {
      map.set(d.id, {
        dossier_id: d.id,
        certif: d.certif ?? null,
        statut: d.statut ?? null,
        heures_prevues: Number(d.heures_prevues ?? 0),
        stagiaire: d.stagiaire ? `${d.stagiaire.prenom ?? ""} ${d.stagiaire.nom ?? ""}`.trim() : "—",
        agence: d.stagiaire?.agence ?? null,
        heures_faites: 0, heures_a_venir: 0, nb_absences: 0, nb_seances: 0,
        prochaine_date: null as string | null,
      });
    }
    const e = map.get(d.id);
    const h = Number(r.heures ?? 0);
    e.nb_seances += 1;
    if (r.emarge_le) e.heures_faites += h;
    else if (r.absence) e.nb_absences += 1;
    else if (r.date_seance >= today) {
      e.heures_a_venir += h;
      if (!e.prochaine_date || r.date_seance < e.prochaine_date) e.prochaine_date = r.date_seance;
    }
  }

  const eleves = Array.from(map.values()).sort((a, b) => {
    const pa = a.prochaine_date ?? "9999", pb = b.prochaine_date ?? "9999";
    return pa < pb ? -1 : pa > pb ? 1 : a.stagiaire.localeCompare(b.stagiaire);
  });

  return NextResponse.json({ ok: true, lieu_formation: "Gagny", eleves });
}
