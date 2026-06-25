/**
 * MYSTORY — lib/anomalies.ts · Calcul des anomalies opérationnelles (source unique).
 * Utilisé par la page /anomalies (affichage) ET le cron /api/cron/anomalies (digest interne).
 * Examen (ventes_examen)        : convocations manquantes · paiements en attente · doublons.
 * Formation (planning/dossiers) : émargements manquants · conventions non signées (> 14 j) · doublons.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SiteFiltre } from "@/lib/sites";

export type Vente = {
  id: string;
  numero_attestation: string | null;
  type_examen: string | null;
  statut_paiement: string | null;
  convocation_envoyee_le: string | null;
  reste_a_payer: number | null;
  montant: number | null;
  session_id: string | null;
  reinscription_de: string | null;
  agence: string | null;
  stagiaires: { nom: string | null; prenom: string | null; telephone: string | null; email: string | null } | null;
  sessions_examen: { date_examen: string | null; horaire: string | null; type: string | null } | null;
};

export type SeanceManquante = { id: string; date_seance: string; demi_journee: string | null; nom: string; prenom: string };
export type ConventionVieille = { dossier_id: string; envoyee_le: string | null; nom: string; prenom: string };
export type DoublonStagiaire = { nom: string; prenom: string; n: number };

export function nomCompletVente(v: Vente): string {
  return `${v.stagiaires?.prenom ?? ""} ${v.stagiaires?.nom ?? ""}`.trim() || "Candidat inconnu";
}

export async function chargerAnomaliesExamen(site: SiteFiltre): Promise<{ convocations: Vente[]; paiements: Vente[]; doublons: Vente[][] }> {
  const auj = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  let q = supabaseAdmin
    .from("ventes_examen")
    .select(
      "id, numero_attestation, type_examen, statut_paiement, convocation_envoyee_le, reste_a_payer, montant, session_id, reinscription_de, agence, stagiaires:candidat_id(nom, prenom, telephone, email), sessions_examen:session_id(date_examen, horaire, type)",
    )
    .neq("type_examen", "Vente_plateforme")
    .not("statut_paiement", "in", '("Remboursé","Annulé")');
  if (site) q = q.eq("agence", site);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Vente[];
  const aVenir = rows.filter((v) => v.sessions_examen?.date_examen && v.sessions_examen.date_examen >= auj);

  const convocations = aVenir
    .filter((v) => (v.statut_paiement === "Payé" || v.statut_paiement === "Inclus CPF") && !v.convocation_envoyee_le)
    .sort((a, b) => String(a.sessions_examen?.date_examen).localeCompare(String(b.sessions_examen?.date_examen)));

  const paiements = aVenir
    .filter((v) => Number(v.reste_a_payer ?? 0) > 0)
    .sort((a, b) => String(a.sessions_examen?.date_examen).localeCompare(String(b.sessions_examen?.date_examen)));

  // Doublons : même candidat + session + type, ≥ 2 ventes actives (réinscriptions exclues).
  const groupes = new Map<string, Vente[]>();
  for (const v of rows) {
    if (v.reinscription_de) continue;
    const k = `${(v.stagiaires?.nom ?? "").trim().toLowerCase()}|${(v.stagiaires?.prenom ?? "").trim().toLowerCase()}|${v.session_id ?? ""}|${v.type_examen ?? ""}`;
    if (!k.replace(/\|/g, "").length) continue;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k)!.push(v);
  }
  const doublons = [...groupes.values()].filter((g) => g.length > 1);

  return { convocations, paiements, doublons };
}

export async function chargerAnomaliesFormation(site: SiteFiltre): Promise<{ emargements: SeanceManquante[]; conventions: ConventionVieille[]; doublons: DoublonStagiaire[] }> {
  const auj = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const il14 = new Date(Date.now() - 14 * 86400000).toISOString();

  const [planning, conv, doss] = await Promise.all([
    supabaseAdmin
      .from("planning")
      .select("id, date_seance, demi_journee, emarge_le, absence, dossier:dossiers!dossier_id ( statut, date_fin, stagiaire:stagiaires!stagiaire_id ( nom, prenom, agence ) )"),
    supabaseAdmin
      .from("v_conventions_a_relancer")
      .select("dossier_id, envoyee_le, stagiaire_nom, stagiaire_prenom")
      .lt("envoyee_le", il14)
      .order("envoyee_le", { ascending: true }),
    supabaseAdmin
      .from("dossiers")
      .select("stagiaire_id, statut, date_fin, stagiaires:stagiaire_id ( nom, prenom, agence )")
      .eq("statut", "incomplet").is("date_fin", null),
  ]);

  const emargements: SeanceManquante[] = ((planning.data as any[]) ?? [])
    .filter((r) => {
      const d = r.dossier;
      if (!d || d.statut !== "incomplet" || d.date_fin != null) return false;
      if (site && (d.stagiaire?.agence ?? "") !== site) return false;
      return r.date_seance && r.date_seance < auj && !r.emarge_le && r.absence !== true;
    })
    .map((r) => ({ id: r.id, date_seance: r.date_seance, demi_journee: r.demi_journee, nom: r.dossier?.stagiaire?.nom ?? "", prenom: r.dossier?.stagiaire?.prenom ?? "" }))
    .sort((a, b) => a.date_seance.localeCompare(b.date_seance));

  const conventions: ConventionVieille[] = ((conv.data as any[]) ?? []).map((c) => ({
    dossier_id: c.dossier_id, envoyee_le: c.envoyee_le, nom: c.stagiaire_nom ?? "", prenom: c.stagiaire_prenom ?? "",
  }));

  const m = new Map<string, { nom: string; prenom: string; n: number }>();
  for (const d of ((doss.data as any[]) ?? [])) {
    const s = Array.isArray(d.stagiaires) ? d.stagiaires[0] : d.stagiaires;
    if (site && (s?.agence ?? "") !== site) continue;
    if (!d.stagiaire_id) continue;
    const cur = m.get(d.stagiaire_id) ?? { nom: s?.nom ?? "", prenom: s?.prenom ?? "", n: 0 };
    cur.n += 1;
    m.set(d.stagiaire_id, cur);
  }
  const doublons: DoublonStagiaire[] = [...m.values()].filter((x) => x.n > 1);

  return { emargements, conventions, doublons };
}
