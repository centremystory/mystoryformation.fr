// app/api/rdv-centres/route.ts
// Rendez-vous des centres — miroir local des 3 agendas Google privés (Rosny/Sarcelles/Gagny).
//
// Pourquoi ce détour : les agendas restent PRIVÉS (décision du 28/09/2026). Les rendre publics
// aurait exposé les noms de stagiaires à qui possède le lien. C'est donc n8n — qui détient déjà
// l'autorisation Google Calendar — qui lit les événements et les pousse ici avec le jeton de
// service. Le CRM les affiche à des utilisateurs déjà authentifiés, et rien ne sort de l'app.
//
// GET  : les rendez-vous à venir (tout staff connecté).
// POST : remplacement de la fenêtre d'un centre (appelé par le robot n8n « Agendas RDV → CRM »).
//        Remplacement et non fusion : c'est ce qui fait disparaître ici un rendez-vous supprimé
//        dans Google. La table est un miroir reconstructible, la source de vérité reste Google.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, requireUser, UnauthorizedError, ForbiddenError } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CENTRES = ["Rosny", "Sarcelles", "Gagny"] as const;
type Centre = (typeof CENTRES)[number];

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);

    const jours = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("jours") ?? 14)));
    const centre = req.nextUrl.searchParams.get("centre");
    const depuis = new Date(Date.now() - 3600_000).toISOString(); // tolérance : le RDV en cours reste visible
    const jusqu = new Date(Date.now() + jours * 86400_000).toISOString();

    let q = supabaseAdmin
      .from("rdv_centres")
      .select("centre, titre, lieu, debut, fin, journee_entiere")
      .eq("annule", false)
      .gte("debut", depuis)
      .lte("debut", jusqu)
      .order("debut", { ascending: true });
    if (centre && (CENTRES as readonly string[]).includes(centre)) q = q.eq("centre", centre);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rendez_vous: data ?? [] });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // requireRole laisse passer les automates (jeton de service n8n) depuis le correctif du 25/09.
    await requireRole(req, ["direction"]);

    const corps = await req.json().catch(() => null);
    const centre = String(corps?.centre ?? "").trim() as Centre;
    if (!CENTRES.includes(centre)) {
      return NextResponse.json(
        { ok: false, erreur: `centre invalide — attendu ${CENTRES.join(", ")}.` },
        { status: 400 }
      );
    }
    if (!Array.isArray(corps?.evenements)) {
      return NextResponse.json(
        { ok: false, erreur: "Corps invalide : { centre, fenetre_debut, fenetre_fin, evenements[] } attendus." },
        { status: 400 }
      );
    }

    const fDebut = corps.fenetre_debut ? new Date(corps.fenetre_debut) : new Date(Date.now() - 86400_000);
    const fFin = corps.fenetre_fin ? new Date(corps.fenetre_fin) : new Date(Date.now() + 30 * 86400_000);
    if (isNaN(fDebut.getTime()) || isNaN(fFin.getTime()) || fFin <= fDebut) {
      return NextResponse.json({ ok: false, erreur: "Fenêtre de dates invalide." }, { status: 400 });
    }

    const lignes = (corps.evenements as any[])
      .map((e) => {
        const debut = e?.debut ? new Date(e.debut) : null;
        if (!debut || isNaN(debut.getTime())) return null;
        const id = String(e?.google_event_id ?? "").trim();
        if (!id) return null;
        const fin = e?.fin ? new Date(e.fin) : null;
        return {
          centre,
          google_event_id: id,
          titre: e?.titre ? String(e.titre).slice(0, 300) : null,
          description: e?.description ? String(e.description).slice(0, 2000) : null,
          lieu: e?.lieu ? String(e.lieu).slice(0, 300) : null,
          debut: debut.toISOString(),
          fin: fin && !isNaN(fin.getTime()) ? fin.toISOString() : null,
          journee_entiere: e?.journee_entiere === true,
          annule: e?.annule === true,
          maj_le: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    // Remplacement de la fenêtre : on vide puis on réécrit, pour que les suppressions
    // faites dans Google disparaissent aussi ici.
    const { error: eDel } = await supabaseAdmin
      .from("rdv_centres")
      .delete()
      .eq("centre", centre)
      .gte("debut", fDebut.toISOString())
      .lte("debut", fFin.toISOString());
    if (eDel) return NextResponse.json({ ok: false, erreur: eDel.message }, { status: 500 });

    if (lignes.length > 0) {
      const { error: eIns } = await supabaseAdmin.from("rdv_centres").insert(lignes);
      if (eIns) return NextResponse.json({ ok: false, erreur: eIns.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, centre, enregistres: lignes.length });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non autorisé" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, erreur: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
