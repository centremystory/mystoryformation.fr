/**
 * MYSTORY — inscription en ligne : listes de référence et lecture d'une session.
 *
 * Partagé par la page publique (GET /inscription-examen) et la route qui reçoit le
 * formulaire (POST /api/inscription-examen). Les deux DOIVENT lire les mêmes listes :
 * un écart entre ce qu'affiche le formulaire et ce qu'accepte le serveur produit des
 * refus incompréhensibles pour le candidat.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TypeExamen } from "@/lib/tarifsExamen";

/**
 * Motivations CCI — liste VERBATIM du formulaire n8n « Page TEF ».
 *
 * Ces libellés partent à la CCI avec l'inscription : ils ne s'improvisent pas et ne
 * se reformulent pas. Toute modification doit être faite des deux côtés à la fois.
 */
export const MOTIVATIONS_CCI = [
  "04. Intégration française",
  "05. Carte de séjour pluriannuelle",
  "06. Carte de résident en France",
  "10. Naturalisation française",
  "11. Naturalisation suisse",
  "17. Autre motivation professionnelle",
  "18. Personnelle / Ne souhaite pas répondre",
] as const;

/** Mentions de l'examen civique, alignées sur le formulaire interne. */
export const MENTIONS_CIVIQUE = [
  "Carte de séjour pluriannuelle",
  "Carte de résident",
  "Naturalisation",
] as const;

export const CENTRES: Record<string, string> = {
  Rosny: "Rosny-sous-Bois",
  Gagny: "Gagny",
  Sarcelles: "Sarcelles",
};

export type SessionPublique = {
  id: string;
  type: TypeExamen;
  date_examen: string;
  horaire: string;
  centre: string;
  centre_nom: string;
  places_restantes: number;
};

/**
 * Lit une session ouverte et encore disponible.
 *
 * Renvoie null si la session n'existe pas, est fermée, est passée, ou est pleine.
 * On ne distingue pas ces cas pour le visiteur : dans tous, la réponse utile est
 * « choisissez une autre date », pas un diagnostic.
 */
export async function lireSession(id: string): Promise<SessionPublique | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: s } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, type, date_examen, horaire, centre, capacite, ouverte")
    .eq("id", id)
    .maybeSingle();
  if (!s || !(s as any).ouverte) return null;

  const auj = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  auj.setHours(0, 0, 0, 0);
  if (new Date(`${(s as any).date_examen}T00:00:00+02:00`) < auj) return null;

  // Places : inscriptions réelles + pré-inscriptions encore en attente. Compter les
  // secondes évite de vendre deux fois la dernière place à deux candidats qui
  // remplissent le formulaire en même temps.
  const [{ count: vendues }, { count: reservees }] = await Promise.all([
    supabaseAdmin.from("ventes_examen").select("id", { count: "exact", head: true })
      .eq("session_id", id),
    supabaseAdmin.from("preinscriptions_examen").select("id", { count: "exact", head: true })
      .eq("session_id", id).eq("statut", "en_attente"),
  ]);
  const restantes = Math.max(0, ((s as any).capacite ?? 0) - (vendues ?? 0) - (reservees ?? 0));
  if (restantes <= 0) return null;

  const centre = String((s as any).centre ?? "");
  return {
    id: String((s as any).id),
    type: (s as any).type as TypeExamen,
    date_examen: String((s as any).date_examen),
    horaire: String((s as any).horaire ?? ""),
    centre,
    centre_nom: CENTRES[centre] ?? centre,
    places_restantes: restantes,
  };
}

/** « lundi 5 octobre 2026 » */
export function jourLisible(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function euros(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
