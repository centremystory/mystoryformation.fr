/**
 * MYSTORY — /api/cron/facturation-partenaire · Facture chaque organisme
 * partenaire le JOUR de l'examen, une fois la passation terminee.
 *
 * L'article 7 de la convention l'autorise : « au plus tard deux jours ouvres
 * apres la session ». Facturer le jour meme, des la fin de l'epreuve, reste dans
 * ce delai et supprime le decalage de tresorerie — c'est la difference entre
 * encaisser a J+2 et encaisser a J+15 parce que personne n'a pense a la facture.
 *
 * ET SURTOUT : la facture couvre « les places consommees ET LES PLACES DUES ».
 * Un candidat absent reste facture, puisque sa place a ete bloquee. C'est pour ca
 * que le declencheur est la FIN DE LA SESSION et non la presence constatee.
 *
 * GET  → apercu : quelles sessions seraient facturees, pour quel montant.
 * POST → emet les factures. ?dryRun=1 calcule sans rien emettre.
 *
 * IDEMPOTENCE. facturerSession ne retient que les places dont facture_id est
 * NULL, et pose ce lien immediatement. Rejouer la route n'emet jamais deux fois
 * la meme facture : le second passage ne trouve plus rien a facturer.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { facturerSession, tarifPartenaire, echecFacture } from "@/lib/facturationPartenaire";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Marge apres l'heure de fin avant de facturer, en minutes. Laisse le temps a
 *  un retardataire d'etre saisi sans decaler la facture au lendemain. */
const MARGE_MIN = Number(process.env.FACTURATION_PARTENAIRE_MARGE_MIN ?? 30);

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    }
    throw e;
  }
}

/** Date et heure courantes a Paris — jamais en UTC : en ete, un cron qui tourne
 *  a 23 h UTC serait deja le lendemain a Paris. */
function maintenantParis(): { iso: string; minutes: number } {
  const p = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const a = p.getFullYear();
  const m = String(p.getMonth() + 1).padStart(2, "0");
  const j = String(p.getDate()).padStart(2, "0");
  return { iso: `${a}-${m}-${j}`, minutes: p.getHours() * 60 + p.getMinutes() };
}

/** « 14h-17h » → 17 h en minutes depuis minuit. Renvoie null si illisible : on
 *  ne devine pas une heure de fin, on prefere ne pas facturer. */
function finEnMinutes(horaire: string | null | undefined): number | null {
  const m = String(horaire ?? "").match(/[-–]\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

type Lot = {
  partenaire_id: string; partenaire: string; session_id: string;
  type: string; horaire: string | null; centre: string | null;
  places: number; tarif: number; montant: number;
};

/** Les lots facturables : sessions du jour, terminees, avec des places non facturees. */
async function aFacturer(): Promise<{ jour: string; lots: Lot[]; attente: string[] }> {
  const { iso, minutes } = maintenantParis();
  const attente: string[] = [];

  const { data: sessions } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, date_examen, horaire, type, centre")
    .eq("date_examen", iso);
  if (!sessions?.length) return { jour: iso, lots: [], attente };

  const pretes: any[] = [];
  for (const s of sessions as any[]) {
    const fin = finEnMinutes(s.horaire);
    if (fin === null) {
      attente.push(`Session ${s.horaire ?? "sans horaire"} (${s.type}) — horaire illisible, non facturée`);
      continue;
    }
    if (minutes < fin + MARGE_MIN) {
      attente.push(`Session ${s.horaire} (${s.type}) — pas encore terminée`);
      continue;
    }
    pretes.push(s);
  }
  if (!pretes.length) return { jour: iso, lots: [], attente };

  const { data: demandes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, partenaire_id, session_id, statut, "
          + "partenaires:partenaire_id (raison_sociale, tarif_tef_irn, tarif_civique, serie_facture)")
    .in("session_id", pretes.map((s) => s.id))
    .is("facture_id", null)
    .in("statut", ["confirmee", "en_attente"]);

  const parSession = new Map(pretes.map((s) => [s.id, s]));
  const lots = new Map<string, Lot>();

  for (const d of (demandes ?? []) as any[]) {
    const s = parSession.get(d.session_id);
    const p = Array.isArray(d.partenaires) ? d.partenaires[0] : d.partenaires;
    if (!s || !p) continue;
    const cle = `${d.partenaire_id}|${d.session_id}`;
    const tarif = tarifPartenaire(p, s.type);
    const lot = lots.get(cle) ?? {
      partenaire_id: d.partenaire_id, partenaire: String(p.raison_sociale ?? "—"),
      session_id: d.session_id, type: String(s.type ?? ""), horaire: s.horaire ?? null,
      centre: s.centre ?? null, places: 0, tarif, montant: 0,
    };
    lot.places += 1;
    lot.montant = lot.places * lot.tarif;
    lots.set(cle, lot);
  }
  return { jour: iso, lots: [...lots.values()], attente };
}

export async function GET(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const { jour, lots, attente } = await aFacturer();
  return NextResponse.json({
    ok: true, apercu: true, jour,
    a_facturer: lots.length,
    total_eur: lots.reduce((t, l) => t + l.montant, 0),
    lots, en_attente: attente,
  });
}

export async function POST(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const auteur = (g as SessionUser).email ?? "cron";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const { jour, lots, attente } = await aFacturer();
  if (!lots.length) {
    return NextResponse.json({
      ok: true, jour, emises: 0, echecs: 0, en_attente: attente,
      message: "Aucune session partenaire terminée à facturer aujourd'hui.",
    });
  }
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, jour,
      auraient_ete_emises: lots.length,
      total_eur: lots.reduce((t, l) => t + l.montant, 0),
      lots, en_attente: attente,
    });
  }

  const emises: Array<{ partenaire: string; numero: string; montant: number; places: number }> = [];
  const echecs: Array<{ partenaire: string; erreur: string }> = [];

  for (const l of lots) {
    const r = await facturerSession({
      partenaireId: l.partenaire_id, sessionId: l.session_id, auteur,
    });
    if (echecFacture(r)) {
      echecs.push({ partenaire: l.partenaire, erreur: r.erreur });
    } else {
      emises.push({ partenaire: l.partenaire, numero: r.facture.numero,
                    montant: r.facture.montant, places: r.facture.places });
    }
  }

  await journal("factures", null, "facturation_partenaire_jour_examen",
    { jour, emises: emises.length, echecs: echecs.length,
      total_eur: emises.reduce((t, f) => t + f.montant, 0) }, auteur);

  // 207 des qu'une seule facture echoue : l'appelant ne doit pas lire « 200 »
  // comme « tout a ete facture ».
  return NextResponse.json(
    { ok: echecs.length === 0, jour,
      emises: emises.length, factures: emises,
      total_eur: emises.reduce((t, f) => t + f.montant, 0),
      echecs: echecs.length, detail_echecs: echecs, en_attente: attente },
    { status: echecs.length ? 207 : 200 },
  );
}
