// app/examens/croise/page.tsx — Vue croisée des inscriptions examen (lecture seule, pilotage).
// Croise type d'examen × mention/plateforme × agence, sur une période. Aucune écriture.
import Link from "next/link";
import { cookies } from "next/headers";
import { Table2 } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE, SITES, type SiteFiltre } from "@/lib/sites";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Civique", Vente_plateforme: "Plateforme" };
const TYPE_ORDRE: Record<string, number> = { TEF_IRN: 0, Examen_civique: 1, Vente_plateforme: 2 };

const PERIODES = [
  { v: "mois", l: "Ce mois" },
  { v: "30", l: "30 jours" },
  { v: "90", l: "90 jours" },
  { v: "tout", l: "Tout" },
] as const;

function borneISO(periode: string): string | null {
  const now = new Date();
  if (periode === "mois") {
    // 1er du mois courant (heure de Paris approximée via UTC, suffisant pour un filtre)
    const p = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    return new Date(p.getFullYear(), p.getMonth(), 1).toISOString();
  }
  if (periode === "30") return new Date(now.getTime() - 30 * 864e5).toISOString();
  if (periode === "90") return new Date(now.getTime() - 90 * 864e5).toISOString();
  return null; // "tout"
}

type Vente = { candidat_id: string | null; type_examen: string; sous_type: string | null; agence: string | null; montant: number | null; created_at: string };

async function charger(periode: string, site: SiteFiltre): Promise<Vente[]> {
  let q = supabaseAdmin
    .from("ventes_examen")
    .select("candidat_id, type_examen, sous_type, agence, montant, created_at")
    .not("statut_paiement", "in", '("Remboursé","Annulé")');
  const b = borneISO(periode);
  if (b) q = q.gte("created_at", b);
  if (site) q = q.eq("agence", site);
  const { data } = await q;
  return (data ?? []) as Vente[];
}

export default async function VueCroisee({ searchParams }: { searchParams: { periode?: string } }) {
  const periode = PERIODES.some((p) => p.v === searchParams.periode) ? (searchParams.periode as string) : "tout";
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const ventes = await charger(periode, site);

  // Agences présentes (SITES d'abord, puis autres), ou la seule sélectionnée.
  const agencesSet = new Set<string>();
  for (const v of ventes) if (v.agence) agencesSet.add(v.agence);
  const agences = site
    ? [site]
    : [...SITES.filter((s) => agencesSet.has(s)), ...[...agencesSet].filter((a) => !SITES.includes(a as any)).sort()];

  // Lignes du tableau croisé : une par couple (type, sous_type).
  type Ligne = { cle: string; type: string; sousType: string; label: string; parAgence: Record<string, number>; total: number };
  const lignes = new Map<string, Ligne>();
  const totauxCol: Record<string, number> = {};
  let totalGeneral = 0, caTotal = 0;
  const parType: Record<string, number> = { TEF_IRN: 0, Examen_civique: 0, Vente_plateforme: 0 };
  const typesParCandidat = new Map<string, Set<string>>();

  for (const v of ventes) {
    const type = v.type_examen;
    const sousType = (v.sous_type ?? "").trim();
    const cle = `${type}|${sousType}`;
    if (!lignes.has(cle)) {
      lignes.set(cle, {
        cle, type, sousType,
        label: `${TYPE_LABEL[type] ?? type}${sousType ? ` · ${sousType}` : ""}`,
        parAgence: {}, total: 0,
      });
    }
    const ag = v.agence ?? "—";
    const ligne = lignes.get(cle)!;
    ligne.parAgence[ag] = (ligne.parAgence[ag] ?? 0) + 1;
    ligne.total += 1;
    totauxCol[ag] = (totauxCol[ag] ?? 0) + 1;
    totalGeneral += 1;
    caTotal += Number(v.montant ?? 0);
    if (type in parType) parType[type] += 1;
    if (v.candidat_id) {
      if (!typesParCandidat.has(v.candidat_id)) typesParCandidat.set(v.candidat_id, new Set());
      typesParCandidat.get(v.candidat_id)!.add(type);
    }
  }

  const lignesTriees = [...lignes.values()].sort((a, b) =>
    (TYPE_ORDRE[a.type] ?? 9) - (TYPE_ORDRE[b.type] ?? 9) || a.sousType.localeCompare(b.sousType));
  const multiExamens = [...typesParCandidat.values()].filter((s) => s.size >= 2).length;
  const euros = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <Table2 size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Vue croisée des examens</h1>
            <p className="page-subtitle">
              Répartition des inscriptions par type d'examen, mention/plateforme et agence.
              <span className="badge badge-info ml-2 align-middle">{site ? `Site : ${site}` : "Tous les sites"}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Filtre période */}
      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODES.map((p) => (
          <Link key={p.v} href={`/examens/croise?periode=${p.v}`}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${periode === p.v ? "border-mystory bg-mystory text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {p.l}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="kpi"><p className="kpi-label">Inscriptions</p><p className="kpi-value mt-1">{totalGeneral}</p></div>
        <div className="kpi"><p className="kpi-label">TEF IRN</p><p className="kpi-value mt-1">{parType.TEF_IRN}</p></div>
        <div className="kpi"><p className="kpi-label">Civique</p><p className="kpi-value mt-1">{parType.Examen_civique}</p></div>
        <div className="kpi"><p className="kpi-label">Plateforme</p><p className="kpi-value mt-1">{parType.Vente_plateforme}</p></div>
        <div className="kpi"><p className="kpi-label">CA encaissable</p><p className="kpi-value mt-1">{euros(caTotal)}</p></div>
      </div>

      {/* Candidats multi-examens (l'angle « croisement ») */}
      {multiExamens > 0 && (
        <div className="mb-6 rounded-2xl border border-mystory/20 bg-mystory-clair/50 p-4 text-sm text-mystory-fonce">
          <strong>{multiExamens}</strong> candidat(s) ont combiné plusieurs types d'examen (ex. TEF + civique, ou examen + plateforme) sur la période.
        </div>
      )}

      {/* Tableau croisé */}
      {totalGeneral === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Table2 size={28} strokeWidth={1.75} className="text-gray-300" />
            <p className="text-sm font-medium text-gray-700">Aucune inscription sur cette période</p>
            <p className="text-xs text-gray-400">Le tableau se remplira au fil des ventes d'examens.</p>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Examen</th>
                {agences.map((a) => <th key={a} className="text-right">{a}</th>)}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lignesTriees.map((l) => (
                <tr key={l.cle}>
                  <td className="font-medium text-gray-800">{l.label}</td>
                  {agences.map((a) => (
                    <td key={a} className="text-right tabular-nums">
                      {l.parAgence[a] ? l.parAgence[a] : <span className="text-gray-300">·</span>}
                    </td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">{l.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Total</td>
                {agences.map((a) => (
                  <td key={a} className="px-3 py-2 text-right font-semibold tabular-nums text-gray-800">{totauxCol[a] ?? 0}</td>
                ))}
                <td className="px-3 py-2 text-right font-bold tabular-nums text-mystory-fonce">{totalGeneral}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">Hors inscriptions annulées ou remboursées. Vue de pilotage, en lecture seule.</p>
    </main>
  );
}
