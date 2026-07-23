// MYSTORY — utilitaires de date.
// « Aujourd'hui » DOIT être calculé en heure de Paris : new Date().toISOString() donne l'UTC,
// donc entre minuit et ~2h (heure d'été), la date UTC est encore la veille → décalage d'un jour
// sur les filtres « sessions du jour », les bornes de carence, les comparaisons « déjà passé », etc.

/** Date du jour au format AAAA-MM-JJ, en heure de Paris. */
export function aujourdhuiParisISO(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
