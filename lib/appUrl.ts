/**
 * MYSTORY — URL de base des liens envoyés par email.
 * Priorité :
 *   1. APP_URL (variable d'environnement explicite) — le réglage propre, ex. https://crm.mystoryformation.fr
 *   2. Le domaine réel de la requête (Origin, sinon x-forwarded-host) — filet : les liens
 *      se calent sur le domaine d'où part la demande, donc jamais sur le mauvais site.
 *   3. Défaut de dernier recours.
 * Pour les envois NON interactifs (cron/n8n, sans requête), définir APP_URL est indispensable.
 */
export function urlDeBase(req?: Request): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (req) {
    const origin = req.headers.get("origin");
    if (origin && /^https?:\/\/.+/.test(origin)) return origin.replace(/\/+$/, "");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    }
  }
  return "https://mystoryformation.fr";
}
