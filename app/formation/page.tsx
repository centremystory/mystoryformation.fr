// app/formation/page.tsx — Tableau de bord de l'espace FORMATION.
// Chiffres du jour (compteurs temps réel, filtrés par site comme l'accueil) +
// alertes + accès rapides. Logique de comptage en lecture seule (supabaseAdmin).
import Link from "next/link";
import { cookies } from "next/headers";
import {
  GraduationCap, Plus, ClipboardList, CalendarDays, TrendingUp, FileText, Signature, Download,
  Clock, CheckCircle2, AlertTriangle, UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE, type SiteFiltre } from "@/lib/sites";
import AlertesFormation from "./AlertesFormation";

export const dynamic = "force-dynamic";

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function kpis(site: SiteFiltre) {
  const today = aujourdhuiParis();
  const debutMois = today.slice(0, 8) + "01";
  const zero = { actifs: 0, incomplets: 0, inscMois: 0, cloturesMois: 0, seancesJour: 0, heuresMois: 0 };
  try {
    const dossiersQ = (build: (q: any) => any) => {
      let q = supabaseAdmin.from("dossiers").select(site ? "id, stagiaires!inner(agence)" : "id", { count: "exact", head: true });
      if (site) q = q.eq("stagiaires.agence", site);
      return build(q);
    };
    let seancesQ = supabaseAdmin.from("planning").select(site ? "id, dossiers!inner(stagiaires!inner(agence))" : "id", { count: "exact", head: true })
      .eq("date_seance", today).is("emarge_le", null).eq("absence", false);
    if (site) seancesQ = seancesQ.eq("dossiers.stagiaires.agence", site);

    let heuresQ = supabaseAdmin.from("planning").select(site ? "heures, dossiers!inner(stagiaires!inner(agence))" : "heures")
      .gte("date_seance", debutMois).lte("date_seance", today).not("emarge_le", "is", null).eq("absence", false);
    if (site) heuresQ = heuresQ.eq("dossiers.stagiaires.agence", site);

    const [actifs, incomplets, inscMois, cloturesMois, seancesJour, heuresRows] = await Promise.all([
      dossiersQ((q) => q.in("statut", ["incomplet", "complet"])),
      dossiersQ((q) => q.eq("statut", "incomplet")),
      dossiersQ((q) => q.gte("created_at", debutMois)),
      dossiersQ((q) => q.gte("date_fin", debutMois)),
      seancesQ,
      heuresQ,
    ]);
    const heuresMois = (heuresRows.data ?? []).reduce((s: number, r: any) => s + Number(r.heures ?? 0), 0);
    return {
      actifs: actifs.count ?? 0,
      incomplets: incomplets.count ?? 0,
      inscMois: inscMois.count ?? 0,
      cloturesMois: cloturesMois.count ?? 0,
      seancesJour: seancesJour.count ?? 0,
      heuresMois,
    };
  } catch {
    return zero;
  }
}

const ACCES: { href: string; icone: LucideIcon; titre: string; desc: string; primaire?: boolean }[] = [
  { href: "/inscriptions/nouvelle", icone: Plus, titre: "Inscrire un stagiaire", desc: "Fiche, planning et contractualisation en une saisie.", primaire: true },
  { href: "/dossiers", icone: ClipboardList, titre: "Suivi des dossiers", desc: "Complet / incomplet et pièces à traiter." },
  { href: "/emargement", icone: Signature, titre: "Émargement", desc: "Feuilles signées par demi-journée." },
  { href: "/planning", icone: CalendarDays, titre: "Planning des élèves", desc: "Séances à venir, par site." },
  { href: "/suivi-eleves", icone: TrendingUp, titre: "Suivi des élèves", desc: "Heures, absences, prochaine séance." },
  { href: "/positionnements", icone: FileText, titre: "Positionnements", desc: "QCM candidats à traiter et niveaux à noter." },
  { href: "/contenu-pedagogique", icone: GraduationCap, titre: "Pédagogie", desc: "Bibliothèque de programmes et supports." },
  { href: "/edof", icone: Download, titre: "Import EDOF", desc: "Réconciliation EDOF → CRM." },
];

function Kpi({ icone: Icone, valeur, label, href, ton }: { icone: LucideIcon; valeur: number | string; label: string; href?: string; ton: string }) {
  const inner = (
    <div className="card card-hover h-full p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ton}`}><Icone size={19} strokeWidth={1.75} /></div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none text-gray-900">{valeur}</p>
          <p className="mt-1 text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export default async function HubFormation() {
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const k = await kpis(site);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <GraduationCap size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Espace Formation</h1>
            <p className="page-subtitle">Les chiffres du jour{site ? ` — ${site}` : ""}, puis les accès rapides.</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icone={ClipboardList} valeur={k.actifs} label="Dossiers en cours" href="/dossiers" ton="bg-mystory-clair text-mystory-fonce" />
        <Kpi icone={AlertTriangle} valeur={k.incomplets} label="À compléter" href="/dossiers" ton="bg-amber-100 text-amber-700" />
        <Kpi icone={Signature} valeur={k.seancesJour} label="À émarger aujourd'hui" href="/emargement" ton="bg-mystory-clair text-mystory-fonce" />
        <Kpi icone={UserPlus} valeur={k.inscMois} label="Inscriptions ce mois" href="/inscriptions/nouvelle" ton="bg-emerald-100 text-emerald-700" />
        <Kpi icone={Clock} valeur={`${k.heuresMois} h`} label="Heures réalisées ce mois" ton="bg-mystory-clair text-mystory-fonce" />
        <Kpi icone={CheckCircle2} valeur={k.cloturesMois} label="Clôtures ce mois" ton="bg-emerald-100 text-emerald-700" />
      </section>

      <AlertesFormation />

      <h2 className="mb-3 mt-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Accès rapides</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACCES.map((c) => {
          const Icone = c.icone;
          if (c.primaire) {
            return (
              <Link key={c.href} href={c.href}
                className="group rounded-2xl border border-mystory bg-mystory p-5 text-white shadow-soft transition hover:bg-mystory-fonce hover:shadow-pop">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><Icone size={20} strokeWidth={1.75} /></div>
                <p className="mt-3 font-semibold">{c.titre}</p>
                <p className="mt-1 text-sm text-blue-50">{c.desc}</p>
              </Link>
            );
          }
          return (
            <Link key={c.href} href={c.href} className="card card-hover group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mystory-clair text-mystory-fonce"><Icone size={20} strokeWidth={1.75} /></div>
              <p className="mt-3 font-semibold text-gray-900">{c.titre}</p>
              <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
