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

/** Jours ouvrés (lun–ven). NB : jours fériés FR non déduits ici — à brancher (gate plus strict). */
function joursOuvres(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d <= to) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n++;
    d.setDate(d.getDate() + 1);
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
