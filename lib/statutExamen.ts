/**
 * MYSTORY — Statut d'examen DÉRIVÉ (option A).
 * Pas de colonne à maintenir : l'état est calculé à partir de signaux fiables
 * (paiement, date de session, résultat, relance). Cohérent partout, zéro désynchronisation.
 */
export type TonStatut = "vert" | "bleu" | "ambre" | "gris";
export type StatutExamen = { code: string; label: string; ton: TonStatut };

export type VenteEtat = {
  statut_paiement?: string | null;
  date_examen?: string | null;          // AAAA-MM-JJ
  convocation_envoyee_le?: string | null;
  resultat?: { statut?: string | null; envoye_le?: string | null } | null;
  relance_resultat_statut?: string | null;
};

function aujourdHuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export function statutExamen(v: VenteEtat, aujourdHui = aujourdHuiParisISO()): StatutExamen {
  const sp = v.statut_paiement ?? "";
  if (sp === "Annulé") return { code: "annule", label: "Annulé", ton: "gris" };
  if (sp === "Remboursé") return { code: "rembourse", label: "Remboursé", ton: "gris" };

  const res = v.resultat?.statut ?? null;
  if (res === "Réussi") {
    return v.resultat?.envoye_le
      ? { code: "cloture", label: "Clôturé", ton: "vert" }
      : { code: "resultat_saisi", label: "Réussi", ton: "vert" };
  }
  if (res === "Échoué" || res === "Absent") {
    const r = v.relance_resultat_statut ?? null;
    if (r === "sans_suite") return { code: "sans_suite", label: "Sans suite", ton: "gris" };
    if (r === "reprogramme") return { code: "reprogramme", label: "Reprogrammé", ton: "bleu" };
    if (r === "relance") return { code: "relance", label: "Relancé", ton: "bleu" };
    return { code: "a_relancer", label: res === "Absent" ? "Absent — à relancer" : "Échoué — à relancer", ton: "ambre" };
  }

  // Pas encore de résultat
  if (!v.date_examen) return { code: "vendu", label: "Vendu", ton: "gris" };
  if (v.date_examen < aujourdHui) return { code: "passe", label: "Passé — résultat à saisir", ton: "ambre" };

  // Examen à venir
  if (v.convocation_envoyee_le === null) return { code: "a_convoquer", label: "À convoquer", ton: "ambre" };
  return { code: "a_venir", label: "À venir", ton: "bleu" };
}

/** Classes Tailwind d'un badge selon le ton. */
export const CLASSES_TON: Record<TonStatut, string> = {
  vert: "bg-green-100 text-green-700",
  bleu: "bg-blue-100 text-blue-700",
  ambre: "bg-amber-100 text-amber-800",
  gris: "bg-gray-100 text-gray-600",
};
