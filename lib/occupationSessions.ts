/**
 * MYSTORY — occupation réelle des sessions, tirée à la demande.
 *
 * 29/09/2026. `ventes_examen` ne contient qu'UNE vente, du 1er juillet : les 1 151 vraies
 * ventes vivent dans le classeur Examens. Compter les places depuis Supabase revenait donc à
 * voir toutes les sessions vides — l'inscription en ligne aurait vendu une 16e place sur 15.
 *
 * **Tiré, pas poussé.** Un robot qui lirait le classeur toutes les 10 minutes ferait 4 300
 * exécutions par mois, dont l'écrasante majorité pour personne. Ici c'est le CRM qui demande
 * l'occupation au moment où un candidat ouvre le formulaire, et seulement si sa copie a plus
 * de 10 minutes. Une dizaine d'appels par jour, et une donnée fraîche quand elle compte.
 *
 * n8n sert de passerelle parce qu'il détient les accès Google ; le CRM n'en a aucun.
 *
 * ⚠️ Si le rafraîchissement échoue et que la copie a plus d'une heure, l'appelant DOIT
 * refuser de vendre. Une occupation périmée fait vendre des places qui n'existent plus.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Au-delà, on retire la donnée avant de s'en servir. */
const FRAICHEUR_MINUTES = 10;
/** Au-delà, la donnée n'est plus digne de confiance : on ne vend plus. */
export const PEREMPTION_MINUTES = 60;

export type Occupation = { inscrits: number; ageMinutes: number | null; fiable: boolean };

/** Âge, en minutes, de la copie la plus récente. null si on n'a jamais rien lu. */
async function ageCopie(): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("sessions_examen")
    .select("occupation_maj_le")
    .not("occupation_maj_le", "is", null)
    .order("occupation_maj_le", { ascending: false })
    .limit(1);
  const maj = (data?.[0] as any)?.occupation_maj_le;
  if (!maj) return null;
  return Math.round((Date.now() - new Date(maj).getTime()) / 60_000);
}

/**
 * Demande l'occupation à n8n et la recopie dans `sessions_examen`.
 * Renvoie le nombre de sessions mises à jour, ou null si l'appel a échoué.
 */
async function rafraichir(): Promise<number | null> {
  const url = process.env.N8N_OCCUPATION_URL;
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.N8N_OCCUPATION_SECRET
          ? { authorization: `Bearer ${process.env.N8N_OCCUPATION_SECRET}` }
          : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const lignes = Array.isArray(j) ? j[0]?.occupation : j?.occupation;
    if (!Array.isArray(lignes)) return null;

    // Garde-fou : une lecture tronquée remettrait toutes les sessions à zéro, donc
    // rouvrirait des places déjà vendues. On préfère garder une copie un peu vieille.
    if (lignes.length < 5) return null;

    const maintenant = new Date().toISOString();
    let n = 0;
    for (const l of lignes) {
      const date = String(l?.date_examen ?? "").trim();
      const horaire = String(l?.horaire ?? "").trim();
      const type = String(l?.type ?? "").trim();
      // 01/10/2026 — le CENTRE fait partie de la clé, et ce n'est pas un détail :
      // 65 créneaux futurs existent à la fois à Gagny et à Rosny avec la même date,
      // le même horaire et le même type. Sans ce filtre, le compte de Gagny (0, le
      // centre est fermé) écrasait celui de Rosny (jusqu'à 12 inscrits) et le
      // formulaire vendait des places déjà prises.
      const centre = String(l?.centre ?? "").trim().toUpperCase();
      const inscrits = Number(l?.inscrits);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !horaire || !type || !centre || !isFinite(inscrits)) continue;
      const { data } = await supabaseAdmin
        .from("sessions_examen")
        .update({ inscrits_reels: Math.max(0, Math.round(inscrits)), occupation_maj_le: maintenant })
        .eq("date_examen", date).eq("horaire", horaire).eq("type", type).eq("centre", centre)
        .select("id");
      n += data?.length ?? 0;
    }

    // Une session future absente du classeur n'a aucun inscrit — sans ça, une session
    // vidée garderait éternellement son ancien compte.
    await supabaseAdmin
      .from("sessions_examen")
      .update({ inscrits_reels: 0, occupation_maj_le: maintenant })
      .gte("date_examen", new Date().toISOString().slice(0, 10))
      .neq("occupation_maj_le", maintenant);

    return n;
  } catch {
    return null;
  }
}

/**
 * Occupation d'une session, rafraîchie si besoin.
 *
 * `fiable` à false = l'appelant ne doit PAS vendre. C'est volontairement strict : mieux vaut
 * un candidat qui appelle qu'un candidat convoqué sur une place inexistante.
 */
/**
 * Un seul rafraîchissement à la fois, partagé par tous les appels en cours.
 *
 * 09/10/2026 — une commande TEF + civique appelle `occupationDe()` DEUX fois, et les
 * deux appels partent en parallèle (`Promise.all` dans `lireCommande`). Sans ce verrou,
 * les deux déclenchaient chacun un rafraîchissement complet du classeur.
 */
let rafraichissementEnCours: Promise<number | null> | null = null;

function rafraichirUneSeuleFois(): Promise<number | null> {
  if (!rafraichissementEnCours) {
    rafraichissementEnCours = rafraichir().finally(() => {
      rafraichissementEnCours = null;
    });
  }
  return rafraichissementEnCours;
}

export async function occupationDe(sessionId: string): Promise<Occupation> {
  const age = await ageCopie();

  /* 🔴 09/10/2026 — ON N'ATTEND LE RAFRAÎCHISSEMENT QUE S'IL EST INDISPENSABLE.
   *
   * Mesuré ce soir en production : la page `/commande` mettait 1,5 à 2,5 s avant le
   * premier octet, et le dirigeant s'en est plaint deux fois. La cause est ici :
   * `rafraichir()` fait UN UPDATE PAR LIGNE du classeur, en série — de l'ordre de
   * 139 allers-retours Supabase — et il partait dès que la copie avait 10 minutes.
   * Autrement dit, un candidat sur deux payait le rafraîchissement de sa poche, en
   * temps d'attente, avant de voir son récapitulatif.
   *
   * Deux seuils, et ils ne servent pas à la même chose :
   *   — `FRAICHEUR_MINUTES` (10) dit quand la copie MÉRITE d'être rafraîchie ;
   *   — `PEREMPTION_MINUTES` (60) dit à partir de quand elle n'est plus FIABLE,
   *     et c'est le seul qui conditionne la vente (`fiable` plus bas).
   * Entre les deux, la copie est encore digne de confiance : on sert tout de suite et
   * on rafraîchit SANS attendre. Au-delà, ou si la copie n'existe pas, on attend —
   * mieux vaut deux secondes qu'un candidat convoqué sur une place inexistante.
   *
   * ⚠️ NE PAS « simplifier » en attendant toujours, ni en n'attendant jamais : le
   * premier cas est le défaut qu'on vient de corriger, le second vend des places qui
   * n'existent plus. */
  if (age === null || age >= PEREMPTION_MINUTES) {
    await rafraichirUneSeuleFois();
  } else if (age >= FRAICHEUR_MINUTES) {
    void rafraichirUneSeuleFois();
  }

  const { data } = await supabaseAdmin
    .from("sessions_examen")
    .select("inscrits_reels, occupation_maj_le")
    .eq("id", sessionId)
    .maybeSingle();

  const maj = (data as any)?.occupation_maj_le;
  const ageFinal = maj ? Math.round((Date.now() - new Date(maj).getTime()) / 60_000) : null;
  return {
    inscrits: Number((data as any)?.inscrits_reels ?? 0),
    ageMinutes: ageFinal,
    fiable: ageFinal != null && ageFinal < PEREMPTION_MINUTES,
  };
}
