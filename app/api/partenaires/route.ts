/**
 * MYSTORY — Gestion des organismes prescripteurs (creation, modification, acces).
 *
 * GET    → la liste des partenaires, avec leur etat d'acces.
 * POST   → cree un partenaire et son lien de premier acces.
 * PATCH  → modifie un partenaire, ou regenere son lien de premier acces.
 *
 * Reserve a l'encadrement : ouvrir un acces partenaire, c'est ouvrir des places
 * d'examen dont nous repondons devant le certificateur.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["direction", "manager"] as const;
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

async function garde(req: NextRequest) {
  try { return { u: await requireRole(req, ROLES), code: 0 }; }
  catch (e) {
    if (e instanceof UnauthorizedError) return { u: null, code: 401 };
    if (e instanceof ForbiddenError) return { u: null, code: 403 };
    throw e;
  }
}
function refus(code: number) {
  return code === 403
    ? NextResponse.json({ ok: false, erreur: "Réservé à la direction et au management." }, { status: 403 })
    : NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  const { data, error } = await supabaseAdmin
    .from("partenaires")
    .select("id, raison_sociale, siret, email, telephone, contact_nom, centre, "
          + "jours_autorises, horaires_autorises, plafond_places, surbooking_autorise, "
          + "tarif_tef_irn, tarif_civique, actif, token, mot_de_passe_hash, "
          + "derniere_connexion, derniere_visite, note, cree_le")
    .order("cree_le", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  // Combien de demandes chacun a-t-il deposees, et combien attendent une decision ?
  const { data: d } = await supabaseAdmin
    .from("demandes_inscription_partenaire").select("partenaire_id, statut");
  const parPartenaire = new Map<string, { total: number; attente: number }>();
  for (const x of d ?? []) {
    const e = parPartenaire.get(x.partenaire_id) ?? { total: 0, attente: 0 };
    e.total++; if (x.statut === "en_attente") e.attente++;
    parPartenaire.set(x.partenaire_id, e);
  }

  const partenaires = (data ?? []).map((p: any) => {
    const { mot_de_passe_hash, token, ...reste } = p;
    return {
      ...reste,
      // Le hash ne sort jamais. On expose seulement l'ETAT de l'acces.
      acces: mot_de_passe_hash ? "actif" : "en_attente_mot_de_passe",
      lien_premier_acces: mot_de_passe_hash ? null : `/prescripteur/${token}`,
      demandes: parPartenaire.get(p.id) ?? { total: 0, attente: 0 },
    };
  });
  return NextResponse.json({ ok: true, partenaires, jours: JOURS });
}

// Les horaires proviennent des sessions reelles : proposer un horaire qui n'existe
// nulle part reviendrait a ouvrir un creneau vide au partenaire.
export async function OPTIONS() {
  const { data } = await supabaseAdmin
    .from("sessions_examen").select("horaire, type, centre").limit(1000);
  const horaires = [...new Set((data ?? []).map((s: any) => s.horaire))].filter(Boolean).sort();
  const centres = [...new Set((data ?? []).map((s: any) => s.centre))].filter(Boolean).sort();
  return NextResponse.json({ ok: true, horaires, centres });
}

function nettoyer(b: any) {
  const jours = Array.isArray(b?.jours_autorises)
    ? b.jours_autorises.filter((j: any) => JOURS.includes(String(j))) : [];
  const horaires = Array.isArray(b?.horaires_autorises)
    ? b.horaires_autorises.map((h: any) => String(h).trim()).filter(Boolean).slice(0, 10) : [];
  const nb = (v: any) => (v === "" || v == null ? null : Number(v));
  return {
    raison_sociale: String(b?.raison_sociale ?? "").trim(),
    siret: String(b?.siret ?? "").replace(/\s/g, "") || null,
    email: String(b?.email ?? "").trim().toLowerCase() || null,
    telephone: String(b?.telephone ?? "").trim() || null,
    contact_nom: String(b?.contact_nom ?? "").trim() || null,
    centre: String(b?.centre ?? "").trim() || null,
    jours_autorises: jours,
    horaires_autorises: horaires,
    plafond_places: nb(b?.plafond_places),
    surbooking_autorise: !!b?.surbooking_autorise,
    tarif_tef_irn: nb(b?.tarif_tef_irn),
    tarif_civique: nb(b?.tarif_civique),
    note: String(b?.note ?? "").trim() || null,
  };
}

export async function POST(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const f = nettoyer(b);

  if (!f.raison_sociale) {
    return NextResponse.json({ ok: false, erreur: "La raison sociale est obligatoire." }, { status: 400 });
  }
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    return NextResponse.json({ ok: false, erreur: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (f.siret && !/^\d{14}$/.test(f.siret)) {
    return NextResponse.json({ ok: false, erreur: "Le SIRET doit comporter 14 chiffres." }, { status: 400 });
  }
  // Sans jour NI horaire, le partenaire ouvre un portail vide. On le refuse plutot
  // que de le laisser decouvrir le probleme devant son ecran.
  if (!f.jours_autorises.length || !f.horaires_autorises.length) {
    return NextResponse.json(
      { ok: false, erreur: "Ouvrez au moins un jour et un horaire, sinon le partenaire ne verra aucun créneau." },
      { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("partenaires")
    .insert({ ...f, actif: true, auteur: u.email ?? null })
    .select("id, token").single();
  if (error) {
    const doublon = error.message.includes("duplicate") || error.code === "23505";
    return NextResponse.json(
      { ok: false, erreur: doublon ? "Un partenaire utilise déjà cette adresse e-mail." : error.message },
      { status: doublon ? 409 : 500 });
  }

  await journal("partenaire", data.id, "creation",
    { raison_sociale: f.raison_sociale, centre: f.centre, jours: f.jours_autorises }, u.email ?? null);
  return NextResponse.json({ ok: true, id: data.id, lien_premier_acces: `/prescripteur/${data.token}` });
}

export async function PATCH(req: NextRequest) {
  const { u, code } = await garde(req);
  if (!u) return refus(code);

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const id = String(b?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, erreur: "id requis." }, { status: 400 });

  // Activer / desactiver, sans toucher au reste.
  if (typeof b?.actif === "boolean" && Object.keys(b).length === 2) {
    const { error } = await supabaseAdmin.from("partenaires").update({ actif: b.actif }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("partenaire", id, b.actif ? "reactivation" : "desactivation", null, u.email ?? null);
    return NextResponse.json({ ok: true });
  }

  // Regenerer le lien de premier acces : le precedent cesse aussitot de fonctionner.
  // Utile si le lien a circule, ou si le partenaire a perdu son mot de passe et son
  // adresse ne repond plus.
  if (b?.action === "regenerer_acces") {
    const { data, error } = await supabaseAdmin
      .from("partenaires")
      .update({ token: crypto.randomUUID(), mot_de_passe_hash: null,
                reset_token: null, reset_token_expire: null, doit_changer_mdp: true })
      .eq("id", id).select("token").single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    await journal("partenaire", id, "acces_regenere", null, u.email ?? null);
    return NextResponse.json({ ok: true, lien_premier_acces: `/prescripteur/${data.token}` });
  }

  const f = nettoyer(b);
  if (!f.raison_sociale) {
    return NextResponse.json({ ok: false, erreur: "La raison sociale est obligatoire." }, { status: 400 });
  }
  if (!f.jours_autorises.length || !f.horaires_autorises.length) {
    return NextResponse.json(
      { ok: false, erreur: "Ouvrez au moins un jour et un horaire, sinon le partenaire ne verra aucun créneau." },
      { status: 400 });
  }
  const { error } = await supabaseAdmin.from("partenaires").update(f).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  await journal("partenaire", id, "modification", { raison_sociale: f.raison_sociale }, u.email ?? null);
  return NextResponse.json({ ok: true });
}
