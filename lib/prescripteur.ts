/**
 * MYSTORY — Portail des partenaires PRESCRIPTEURS.
 *
 * 09/09/2026 — a ne pas confondre avec lib/partenaire.ts, qui sert aux FORMATEURS
 * sous-traitants (depot d'emargements, de factures, de justificatifs FLE). Ici il
 * s'agit d'un organisme tiers — Secure Academy en premier — qui inscrit SES
 * candidats dans NOS sessions d'examen. Deux metiers, deux portails.
 *
 * L'acces se fait par jeton : le prescripteur n'a pas de compte utilisateur. Le
 * jeton tient donc lieu d'authentification, et TOUTE requete est bornee au
 * partenaire qu'il resout — jamais un candidat d'un autre organisme, jamais une
 * session hors de ses creneaux.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export interface Prescripteur {
  id: string;
  raison_sociale: string;
  contact_nom: string | null;
  centre: string | null;
  jours_autorises: string[];
  horaires_autorises: string[];
  plafond_places: number | null;
  surbooking_autorise: boolean;
  tarif_tef_irn: number | null;
  tarif_civique: number | null;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Le jour de la semaine d'une date ISO, en minuscules sans accent. */
export function jourDe(iso: string): string {
  // On construit la date en UTC : `new Date("2026-09-15")` est deja interprete en
  // UTC, mais `getDay()` rend le jour LOCAL. A Paris en ete, une session du mardi
  // a minuit UTC devient lundi 2 h — et le partenaire ne verrait plus son creneau.
  const [a, m, j] = iso.split("-").map(Number);
  return JOURS[new Date(Date.UTC(a, (m ?? 1) - 1, j ?? 1)).getUTCDay()];
}

/** Resout un prescripteur actif depuis son jeton. null si introuvable ou desactive. */
export async function resolverPrescripteur(token: string): Promise<Prescripteur | null> {
  if (!token || token.length < 30) return null;   // un uuid fait 36 caracteres
  const { data } = await supabaseAdmin
    .from("partenaires")
    .select("id, raison_sociale, contact_nom, centre, jours_autorises, horaires_autorises, "
          + "plafond_places, surbooking_autorise, tarif_tef_irn, tarif_civique, actif")
    .eq("token", token).eq("actif", true).maybeSingle();
  if (!data) return null;
  const { actif, ...p } = data as any;
  return {
    ...p,
    jours_autorises: p.jours_autorises ?? [],
    horaires_autorises: p.horaires_autorises ?? [],
    tarif_tef_irn: p.tarif_tef_irn != null ? Number(p.tarif_tef_irn) : null,
    tarif_civique: p.tarif_civique != null ? Number(p.tarif_civique) : null,
  } as Prescripteur;
}

/** Meme chose que resolverPrescripteur, mais depuis l'identifiant de session. */
export async function resolverPrescripteurParId(id: string): Promise<Prescripteur | null> {
  const { data } = await supabaseAdmin
    .from("partenaires")
    .select("id, raison_sociale, contact_nom, centre, jours_autorises, horaires_autorises, "
          + "plafond_places, surbooking_autorise, tarif_tef_irn, tarif_civique, actif")
    .eq("id", id).eq("actif", true).maybeSingle();
  if (!data) return null;
  const { actif, ...p } = data as any;
  return {
    ...p,
    jours_autorises: p.jours_autorises ?? [],
    horaires_autorises: p.horaires_autorises ?? [],
    tarif_tef_irn: p.tarif_tef_irn != null ? Number(p.tarif_tef_irn) : null,
    tarif_civique: p.tarif_civique != null ? Number(p.tarif_civique) : null,
  } as Prescripteur;
}

/**
 * Les sessions que CE partenaire peut reserver, avec les places qui lui restent.
 *
 * Le filtrage est fait ICI, cote serveur, jamais dans la page : un partenaire qui
 * bricolerait la requete ne doit pas pouvoir reserver un creneau qu'on ne lui a pas
 * ouvert. Un partenaire sans creneau autorise voit une liste vide, et c'est voulu.
 */
export async function sessionsOuvertes(p: Prescripteur, jours = 60) {
  if (!p.jours_autorises.length || !p.horaires_autorises.length) return [];

  const auj = new Date();
  const debut = auj.toISOString().slice(0, 10);
  const fin = new Date(auj.getTime() + jours * 86400000).toISOString().slice(0, 10);

  let q = supabaseAdmin
    .from("sessions_examen")
    .select("id, type, date_examen, horaire, capacite, centre")
    .gte("date_examen", debut).lte("date_examen", fin)
    .in("horaire", p.horaires_autorises)
    .order("date_examen", { ascending: true }).order("horaire", { ascending: true });
  if (p.centre) q = q.eq("centre", p.centre);

  const { data: sessions } = await q;
  const retenues = (sessions ?? []).filter((s: any) =>
    p.jours_autorises.includes(jourDe(s.date_examen)));
  if (!retenues.length) return [];

  // Combien de places chaque session a-t-elle deja consommees, tous canaux confondus ?
  const ids = retenues.map((s: any) => s.id);
  const { data: demandes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("session_id, partenaire_id, statut")
    .in("session_id", ids)
    .in("statut", ["en_attente", "confirmee"]);

  const prises = new Map<string, number>();
  const miennes = new Map<string, number>();
  for (const d of demandes ?? []) {
    prises.set(d.session_id, (prises.get(d.session_id) ?? 0) + 1);
    if (d.partenaire_id === p.id) miennes.set(d.session_id, (miennes.get(d.session_id) ?? 0) + 1);
  }

  return retenues.map((s: any) => {
    const occupees = prises.get(s.id) ?? 0;
    const aMoi = miennes.get(s.id) ?? 0;
    const restantesSession = Math.max(0, (s.capacite ?? 0) - occupees);
    // Le plafond du partenaire s'applique PAR SESSION : il borne ce qu'il peut
    // reserver sans bloquer les inscriptions directes du centre.
    const restantesPartenaire = p.plafond_places != null
      ? Math.max(0, p.plafond_places - aMoi)
      : restantesSession;
    return {
      id: s.id,
      type: s.type,
      date_examen: s.date_examen,
      jour: jourDe(s.date_examen),
      horaire: s.horaire,
      centre: s.centre,
      mes_inscrits: aMoi,
      places_restantes: p.surbooking_autorise
        ? restantesPartenaire
        : Math.min(restantesSession, restantesPartenaire),
    };
  });
}

/** Les demandes deja deposees par ce partenaire, recentes d'abord. */
export async function mesDemandes(p: Prescripteur, limite = 200) {
  const { data } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, candidat_nom, candidat_prenom, candidat_email, candidat_telephone, "
          + "candidat_naissance, statut, motif_refus, demande_le, piece_identite_nom, sous_type, "
          + "sessions_examen:session_id (type, date_examen, horaire, centre)")
    .eq("partenaire_id", p.id)
    .order("demande_le", { ascending: false }).limit(limite);
  return (data ?? []).map((d: any) => {
    const s = Array.isArray(d.sessions_examen) ? d.sessions_examen[0] : d.sessions_examen;
    return {
      id: d.id,
      nom: d.candidat_nom, prenom: d.candidat_prenom,
      email: d.candidat_email, telephone: d.candidat_telephone,
      naissance: d.candidat_naissance,
      statut: d.statut, motif_refus: d.motif_refus, demande_le: d.demande_le,
      piece: d.piece_identite_nom ?? null,
      sous_type: d.sous_type ?? null,
      session: s ? { type: s.type, date: s.date_examen, horaire: s.horaire, centre: s.centre } : null,
    };
  });
}
