// app/anomalies/page.tsx — Anomalies opérationnelles (examen + formation).
// Examen (ventes_examen)   : convocations manquantes · paiements en attente · doublons.
// Formation (planning/dossiers) : émargements manquants · conventions non signées (> 14 j) · doublons stagiaires.
// Lecture seule + actions rapides (appeler, ouvrir les espaces).
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, FileWarning, CreditCard, Copy, Phone, ArrowRight, CheckCircle2, PenLine, FileSignature, GraduationCap, ClipboardList } from "lucide-react";
import { siteValide, COOKIE_SITE } from "@/lib/sites";
import { chargerAnomaliesExamen, chargerAnomaliesFormation, nomCompletVente as nomComplet, type Vente } from "@/lib/anomalies";

export const dynamic = "force-dynamic";

function frDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}
const eur = (n: number | null | undefined) => `${Math.round(Number(n ?? 0))} €`;

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
  const [{ convocations, paiements, doublons }, form] = await Promise.all([chargerAnomaliesExamen(site), chargerAnomaliesFormation(site)]);
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
