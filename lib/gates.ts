/**
 * MYSTORY — Gates de conformité (2B) lus depuis Supabase.
 * checkConformite() renvoie { ok, recap[] }. Les routes répondent 409 + recap si KO.
 * n8n n'a PAS à refaire ces contrôles : il appelle l'endpoint et lit le 409.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export interface GateResult {
  ok: boolean;
  recap: string[];
}

/** Date au format YYYY-MM-DD (référentiel UTC, cohérent quel que soit le fuseau serveur). */
function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dimanche de Pâques (computus grégorien, Meeus) pour une année donnée. */
function paques(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, mois - 1, jour));
}

const _feriesCache = new Map<number, Set<string>>();
/** Jours fériés nationaux français (métropole hors Alsace-Moselle) d'une année, en YYYY-MM-DD. */
function joursFeriesFR(year: number): Set<string> {
  const cached = _feriesCache.get(year);
  if (cached) return cached;
  const p = paques(year);
  const apresPaques = (days: number) => {
    const x = new Date(p);
    x.setUTCDate(x.getUTCDate() + days);
    return isoUTC(x);
  };
  const s = new Set<string>([
    `${year}-01-01`, // Jour de l'an
    `${year}-05-01`, // Fête du Travail
    `${year}-05-08`, // Victoire 1945
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
    apresPaques(1),  // Lundi de Pâques
    apresPaques(39), // Ascension
    apresPaques(50), // Lundi de Pentecôte
  ]);
  _feriesCache.set(year, s);
  return s;
}

/** Jours ouvrés (lun–ven) hors jours fériés nationaux français, entre `from` (exclu) et `to` (inclus). */
function joursOuvres(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d <= to) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !joursFeriesFR(d.getUTCFullYear()).has(isoUTC(d))) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export async function checkConformite(dossierId: string): Promise<GateResult> {
  const recap: string[] = [];

  const { data: d, error } = await supabaseAdmin
    .from("dossiers")
    .select(`
      certif, financement, montant, reste_a_charge_accepte,
      heures_prevues, heures_edof, date_validation_commande, formatrice_id,
      formatrice:formatrices!formatrice_id ( nom, justificatif_fle ),
      planning ( date_seance, heures )
    `)
    .eq("id", dossierId)
    .single();

  if (error || !d) return { ok: false, recap: ["Dossier introuvable."] };

  // Plafond CPF
  if (d.financement === "CPF" && Number(d.montant) > 1500 && !d.reste_a_charge_accepte) {
    recap.push(`Plafond CPF dépassé (${d.montant} €) sans reste à charge accepté.`);
  }

  // Heures prévues = Σ planning
  const planning = (d as any).planning ?? [];
  if (planning.length === 0) {
    recap.push("Aucune séance au planning.");
  } else {
    const sommeH = planning.reduce((s: number, p: any) => s + Number(p.heures), 0);
    if (sommeH !== Number(d.heures_prevues)) {
      recap.push(`Heures planning (${sommeH} h) ≠ heures prévues (${d.heures_prevues} h).`);
    }
  }

  // Cohérence EDOF (si la valeur a été saisie)
  if (d.heures_edof != null && Number(d.heures_edof) !== Number(d.heures_prevues)) {
    recap.push(`Heures EDOF (${d.heures_edof} h) ≠ heures prévues (${d.heures_prevues} h).`);
  }

  // Cohérence FORMULE (source unique : table public.formules) — heures/prix officiels.
  // Garantit l'impossibilité d'un écart prix ↔ EDOF (durée et prix verrouillés ensemble).
  const { data: formule } = await supabaseAdmin
    .from("formules")
    .select("prix_eur")
    .eq("certif", (d as any).certif)
    .eq("heures", Number(d.heures_prevues))
    .eq("actif", true)
    .maybeSingle();
  if (!formule) {
    recap.push(`Aucune formule officielle pour ${d.heures_prevues} h (${(d as any).certif}). Formules valides : 6 h, 16 h, 26 h.`);
  } else if (Number(formule.prix_eur) !== Number(d.montant)) {
    recap.push(`Tarif non conforme : la formule ${d.heures_prevues} h doit être facturée ${formule.prix_eur} € (dossier : ${d.montant} €).`);
  }

  // FLE — formatrice référent
  const f = (d as any).formatrice;
  if (!d.formatrice_id || !f) recap.push("Formatrice référent non assignée (dossiers.formatrice_id).");
  else if (!f.justificatif_fle) recap.push(`Formatrice ${f.nom} sans justificatif FLE.`);

  // Délai d'accès ≥ 11 jours ouvrés (validation commande → 1re séance)
  const dates = planning.map((p: any) => p.date_seance).filter(Boolean).sort();
  const premiere = dates[0];
  if (!d.date_validation_commande) {
    recap.push("Date de validation de commande manquante (requise pour le délai de 11 j ouvrés).");
  } else if (premiere) {
    const jo = joursOuvres(new Date(d.date_validation_commande), new Date(premiere));
    if (jo < 11) recap.push(`Délai d'accès insuffisant : ${jo} j ouvrés (< 11) avant la 1re séance.`);
  }

  return { ok: recap.length === 0, recap };
}
