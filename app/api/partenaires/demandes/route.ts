/**
 * MYSTORY — Back-office : les demandes d'inscription deposees par les prescripteurs.
 *
 * GET   → les demandes, la plus urgente d'abord (session la plus proche).
 * PATCH → confirme ou refuse une demande. Un refus exige un motif : l'article 4 de
 *         la convention nous engage a motiver, et un refus sec se paie au telephone.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 10/09/2026 — CORRECTION DE SECURITE. La garde n'appelait que requireUser : tout
// compte connecte pouvait confirmer ou refuser une place partenaire. Or le
// middleware ne filtre PAS les routes API par role — il le dit lui-meme, « les API
// gardent leurs propres controles » — et la ligne "/partenaires" ajoutee dans
// PAGE_PERMISSIONS ne protege que la PAGE, pas cette route.
//
// Confirmer une place engage le centre devant le certificateur et consomme une
// capacite d'examen : c'est une decision d'encadrement, pas une action de saisie.
const ROLES = ["direction", "manager", "back_office"] as const;

/** 401 si non authentifie, 403 si authentifie mais sans le role — jamais confondus. */
async function garde(req: NextRequest) {
  try {
    return { u: await requireRole(req, ROLES), code: 0 };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { u: null, code: 401 };
    if (e instanceof ForbiddenError) return { u: null, code: 403 };
    throw e;
  }
}

function refus(code: number) {
  return code === 403
    ? NextResponse.json(
        { ok: false, erreur: "Réservé à la direction, au management et au back-office." },
        { status: 403 })
    : NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  const statut = req.nextUrl.searchParams.get("statut") ?? "en_attente";
  let q = supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, candidat_nom, candidat_prenom, candidat_email, candidat_telephone, "
          + "candidat_naissance, candidat_civilite, candidat_genre, candidat_lieu_naissance, "
          + "candidat_langue_maternelle, candidat_nationalite, candidat_adresse, "
          + "candidat_code_postal, candidat_ville, candidat_pays, candidat_num_piece, "
          + "sous_type, piece_identite_path, piece_identite_nom, "
          + "statut, motif_refus, demande_le, decide_le, decide_par, "
          + "partenaires:partenaire_id (raison_sociale), "
          + "sessions_examen:session_id (type, date_examen, horaire, centre, capacite)")
    .order("demande_le", { ascending: true }).limit(500);
  if (statut !== "toutes") q = q.eq("statut", statut);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const demandes = (data ?? []).map((d: any) => {
    const p = Array.isArray(d.partenaires) ? d.partenaires[0] : d.partenaires;
    const s = Array.isArray(d.sessions_examen) ? d.sessions_examen[0] : d.sessions_examen;
    return {
      id: d.id,
      partenaire: p?.raison_sociale ?? "—",
      nom: d.candidat_nom, prenom: d.candidat_prenom,
      email: d.candidat_email, telephone: d.candidat_telephone,
      naissance: d.candidat_naissance,
      civilite: d.candidat_civilite, genre: d.candidat_genre,
      lieu_naissance: d.candidat_lieu_naissance,
      langue_maternelle: d.candidat_langue_maternelle,
      nationalite: d.candidat_nationalite,
      adresse: d.candidat_adresse, code_postal: d.candidat_code_postal,
      ville: d.candidat_ville, pays: d.candidat_pays,
      num_piece: d.candidat_num_piece, sous_type: d.sous_type,
      piece_nom: d.piece_identite_nom, piece_path: d.piece_identite_path,
      statut: d.statut, motif_refus: d.motif_refus,
      demande_le: d.demande_le, decide_le: d.decide_le, decide_par: d.decide_par,
      session: s ? {
        type: s.type, date: s.date_examen, horaire: s.horaire,
        centre: s.centre, capacite: s.capacite,
      } : null,
    };
  });

  // La session la plus proche remonte en premier : c'est celle qui n'attend plus.
  demandes.sort((a: any, b: any) => (a.session?.date ?? "9") < (b.session?.date ?? "9") ? -1 : 1);
  return NextResponse.json({ ok: true, demandes, total: demandes.length });
}

export async function PATCH(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  const decision = String(b?.decision ?? "").trim();      // "confirmee" | "refusee"
  const motif = String(b?.motif ?? "").trim().slice(0, 500);

  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });
  if (!["confirmee", "refusee"].includes(decision)) {
    return NextResponse.json({ ok: false, erreur: "Décision invalide." }, { status: 400 });
  }
  // Article 4 de la convention : « Le Centre motive tout refus. »
  if (decision === "refusee" && !motif) {
    return NextResponse.json(
      { ok: false, erreur: "Un refus doit être motivé (article 4 de la convention)." },
      { status: 400 });
  }

  const { data: d } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, statut, session_id, candidat_nom, candidat_prenom").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ ok: false, erreur: "Demande introuvable." }, { status: 404 });
  if (d.statut !== "en_attente") {
    return NextResponse.json(
      { ok: false, erreur: `Cette demande est déjà « ${d.statut} ».` }, { status: 409 });
  }

  // Une confirmation ne doit pas faire deborder la session : on recompte AU MOMENT
  // de decider, pas au moment du depot. Entre les deux, d'autres places sont parties.
  if (decision === "confirmee") {
    const { data: s } = await supabaseAdmin
      .from("sessions_examen").select("capacite").eq("id", d.session_id).maybeSingle();
    const { count } = await supabaseAdmin
      .from("demandes_inscription_partenaire")
      .select("id", { count: "exact", head: true })
      .eq("session_id", d.session_id).eq("statut", "confirmee");
    if (s?.capacite != null && (count ?? 0) >= s.capacite) {
      return NextResponse.json(
        { ok: false, erreur: `Session complète : ${count} confirmés pour ${s.capacite} places.` },
        { status: 409 });
    }
  }

  const { error } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .update({
      statut: decision,
      motif_refus: decision === "refusee" ? motif : null,
      decide_le: new Date().toISOString(),
      decide_par: u.email ?? null,
    })
    .eq("id", id).eq("statut", "en_attente");   // garde-fou anti double-decision
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  await journal("demande_partenaire", id, `decision_${decision}`,
    { candidat: `${d.candidat_prenom} ${d.candidat_nom}`, motif: motif || null }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
