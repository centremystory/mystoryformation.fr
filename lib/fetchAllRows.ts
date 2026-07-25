// lib/fetchAllRows.ts — Contourne le plafond 1000 lignes de PostgREST/Supabase.
//
// PostgREST tronque TOUTE requête à 1000 lignes par défaut, silencieusement
// (vérifié en prod : une requête sur 1500 lignes n'en renvoie que 1000, sans erreur).
// À 4000 examens/an, un agrégat ou un export lu d'un coup calculerait donc sur un
// échantillon tronqué → chiffres faux, dossiers manquants, SANS aucune alerte.
//
// Ce helper pagine la lecture par lots successifs jusqu'à épuisement : l'appelant
// fournit une fonction qui applique `.range(from, to)` à sa requête (filtres + tri
// inclus). Le tri DOIT être stable (une colonne unique, ex. id/created_at) sinon la
// pagination peut sauter ou dupliquer des lignes entre deux lots.
//
// Usage :
//   const rows = await fetchAllRows((from, to) =>
//     supabaseAdmin.from("ventes_examen").select("...").order("id").range(from, to)
//   );

const TAILLE_LOT = 1000;
const MAX_LOTS = 60; // garde-fou : 60 000 lignes max → jamais de boucle infinie

type Reponse<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T = any>(
  construireRequete: (from: number, to: number) => PromiseLike<Reponse<T>>,
): Promise<T[]> {
  const tout: T[] = [];
  for (let lot = 0; lot < MAX_LOTS; lot++) {
    const from = lot * TAILLE_LOT;
    const to = from + TAILLE_LOT - 1;
    const { data, error } = await construireRequete(from, to);
    if (error) throw error;
    const lignes = data ?? [];
    tout.push(...lignes);
    if (lignes.length < TAILLE_LOT) break; // dernier lot atteint
  }
  return tout;
}
