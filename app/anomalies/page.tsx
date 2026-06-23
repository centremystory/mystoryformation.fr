// app/anomalies/page.tsx — Anomalies opérationnelles (examen + formation).
// Examen (ventes_examen)   : convocations manquantes · paiements en attente · doublons.
// Formation (planning/dossiers) : émargements manquants · conventions non signées (> 14 j) · doublons stagiaires.
// Lecture seule + actions rapides (appeler, ouvrir les espaces).
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, FileWarning, CreditCard, Copy, Phone, ArrowRight, CheckCircle2, PenLine, FileSignature, GraduationCap, ClipboardList } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE, type SiteFiltre } from "@/lib/sites";

export const dynamic = "force-dynamic";

type Vente = {
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

function frDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}
const eur = (n: number | null | undefined) => `${Math.round(Number(n ?? 0))} €`;
function nomComplet(v: Vente): string {
  return `${v.stagiaires?.prenom ?? ""} ${v.stagiaires?.nom ?? ""}`.trim() || "Candidat inconnu";
}

async function charger(site: SiteFiltre) {
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

// ————————————————————————— Formation —————————————————————————
type SeanceManquante = { id: string; date_seance: string; demi_journee: string | null; nom: string; prenom: string };
type ConventionVieille = { dossier_id: string; envoyee_le: string | null; nom: string; prenom: string };
type DoublonStagiaire = { nom: string; prenom: string; n: number };

async function chargerFormation(site: SiteFiltre) {
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

  // Émargements manquants : séance passée, non signée, non absente, dossier en cours.
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

  // Doublons stagiaires : ≥ 2 dossiers en cours pour la même personne.
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

function LigneCandidat({ v, children }: { v: Vente; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{nomComplet(v)}</p>
        <p className="truncate text-xs text-gray-500">
          {v.sessions_examen?.type === "Examen_civique" ? "Civique" : "TEF IRN"} · {frDate(v.sessions_examen?.date_examen ?? null)}
          {v.sessions_examen?.horaire ? ` · ${v.sessions_examen.horaire}` : ""}
          {v.agence ? ` · ${v.agence}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        {v.stagiaires?.telephone && (
          <a href={`tel:${v.stagiaires.telephone}`} className="btn-ghost !px-2 !py-1" title="Appeler">
            <Phone size={15} />
          </a>
        )}
      </div>
    </div>
  );
}

function Bloc({ titre, icone: Icone, n, children }: { titre: string; icone: typeof FileWarning; n: number; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Icone size={16} strokeWidth={1.9} className="text-amber-600" />
          {titre}
        </h2>
        <span className={`badge ${n > 0 ? "badge-warning" : "badge-success"}`}>{n}</span>
      </div>
      {n === 0 ? (
        <div className="card"><div className="empty-state"><CheckCircle2 size={24} className="text-success-600" /><p className="text-sm text-gray-500">Rien à signaler.</p></div></div>
      ) : (
        <div className="card !p-0 divide-y divide-gray-100">{children}</div>
      )}
    </section>
  );
}

export default async function AnomaliesPage() {
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const [{ convocations, paiements, doublons }, form] = await Promise.all([charger(site), chargerFormation(site)]);
  const totalEx = convocations.length + paiements.length + doublons.length;
  const totalForm = form.emargements.length + form.conventions.length + form.doublons.length;
  const total = totalEx + totalForm;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Anomalies</h1>
            <p className="page-subtitle">
              Examen et formation : convocation, paiement, émargement, conventions, doublons.
              <span className="badge badge-info ml-2 align-middle">{site ? `Site : ${site}` : "Tous les sites"}</span>
            </p>
          </div>
        </div>
        <Link href="/examen" className="btn-ghost">Espace Examen <ArrowRight size={16} /></Link>
      </header>

      {total === 0 && (
        <div className="card mb-8">
          <div className="empty-state">
            <CheckCircle2 size={28} strokeWidth={1.75} className="text-success-600" />
            <p className="text-sm font-medium text-gray-700">Aucune anomalie</p>
            <p className="text-xs text-gray-400">Examen et formation sont en ordre sur votre périmètre.</p>
          </div>
        </div>
      )}

      {/* ——— Examen ——— */}
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <ClipboardList size={14} /> Examen <span className="badge badge-neutral">{totalEx}</span>
      </h2>

      <Bloc titre="Convocations manquantes" icone={FileWarning} n={convocations.length}>
        {convocations.map((v) => (
          <LigneCandidat key={v.id} v={v}>
            <span className="badge badge-warning">à envoyer</span>
          </LigneCandidat>
        ))}
      </Bloc>

      <Bloc titre="Paiements en attente" icone={CreditCard} n={paiements.length}>
        {paiements.map((v) => (
          <LigneCandidat key={v.id} v={v}>
            <span className="text-xs font-medium text-red-600">reste {eur(v.reste_a_payer)}</span>
          </LigneCandidat>
        ))}
      </Bloc>

      <Bloc titre="Doublons (examen)" icone={Copy} n={doublons.length}>
        {doublons.map((g, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{nomComplet(g[0])}</p>
            <p className="text-xs text-gray-500">
              {g.length} ventes sur la même session ({g[0].sessions_examen?.type === "Examen_civique" ? "Civique" : "TEF IRN"} · {frDate(g[0].sessions_examen?.date_examen ?? null)})
              {" — "}attestations {g.map((x) => x.numero_attestation ?? "?").join(", ")}
            </p>
          </div>
        ))}
      </Bloc>

      {/* ——— Formation ——— */}
      <h2 className="mb-2 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <GraduationCap size={14} /> Formation <span className="badge badge-neutral">{totalForm}</span>
      </h2>

      <Bloc titre="Émargements manquants" icone={PenLine} n={form.emargements.length}>
        {form.emargements.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{`${s.prenom} ${s.nom}`.trim() || "Stagiaire"}</p>
              <p className="truncate text-xs text-gray-500">Séance du {frDate(s.date_seance)}{s.demi_journee ? ` · ${s.demi_journee}` : ""} — non signée</p>
            </div>
            <Link href="/emargement" className="btn-ghost !px-2.5 !py-1 text-xs shrink-0">Émarger</Link>
          </div>
        ))}
      </Bloc>

      <Bloc titre="Conventions non signées (> 14 j)" icone={FileSignature} n={form.conventions.length}>
        {form.conventions.map((c) => (
          <Link key={c.dossier_id} href="/dossiers" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
            <span className="truncate text-sm font-medium text-gray-900">{`${c.prenom} ${c.nom}`.trim() || "Stagiaire"}</span>
            <span className="shrink-0 text-xs text-red-600">envoyée le {frDate(c.envoyee_le)}</span>
          </Link>
        ))}
      </Bloc>

      <Bloc titre="Doublons (stagiaires)" icone={Copy} n={form.doublons.length}>
        {form.doublons.map((d, i) => (
          <div key={i} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{`${d.prenom} ${d.nom}`.trim() || "Stagiaire"}</p>
            <p className="text-xs text-gray-500">{d.n} dossiers de formation en cours pour la même personne.</p>
          </div>
        ))}
      </Bloc>
    </main>
  );
}
