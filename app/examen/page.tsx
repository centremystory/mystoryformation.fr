// app/examen/page.tsx — Tableau de bord de l'espace EXAMEN (TEF IRN & civiques).
// Chiffres du jour (ventes, examens à venir, à convoquer, pré-inscriptions, liste d'attente)
// + accès rapides. Centre d'examen unique : Gagny. Lecture seule (supabaseAdmin).
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ClipboardList, Plus, Users, CalendarDays, CheckCircle2, FileCheck,
  Send, Phone, Hourglass, Banknote, TrendingUp, RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { siteValide, COOKIE_SITE, type SiteFiltre } from "@/lib/sites";

export const dynamic = "force-dynamic";

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const actifVente = (s: string) => !["Annulé", "Remboursé"].includes(s);
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

async function kpis(site: SiteFiltre) {
  const today = aujourdhuiParis();
  const debutMois = today.slice(0, 8) + "01";
  const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7);
  const dans7 = d.toISOString().slice(0, 10);
  const zero = { ventesMois: 0, caMois: 0, examensSemaine: 0, aConvoquer: 0, preinscriptions: 0, listeAttente: 0 };
  try {
    const [ventesR, sessionsR, preinsR, attenteR] = await Promise.all([
      supabaseAdmin.from("ventes_examen").select("montant, statut_paiement, created_at, convocation_envoyee_le, session_id, agence"),
      supabaseAdmin.from("sessions_examen").select("id, date_examen"),
      supabaseAdmin.from("preinscriptions_examen").select("statut", { count: "exact", head: true }).eq("statut", "en_attente"),
      supabaseAdmin.from("liste_attente_examen").select("statut", { count: "exact", head: true }).eq("statut", "en_attente"),
    ]);

    const ventes = (ventesR.data ?? []).filter((v: any) => !site || v.agence === site);
    const dateSession = new Map<string, string>((sessionsR.data ?? []).map((s: any) => [s.id, s.date_examen]));

    const duMois = ventes.filter((v: any) => String(v.created_at ?? "") >= debutMois && actifVente(v.statut_paiement));
    const ventesMois = duMois.length;
    const caMois = duMois.reduce((s: number, v: any) => s + Number(v.montant ?? 0), 0);

    const aConvoquer = ventes.filter((v: any) =>
      actifVente(v.statut_paiement) && !v.convocation_envoyee_le && String(dateSession.get(v.session_id) ?? "") >= today
    ).length;

    const sessions = sessionsR.data ?? [];
    const examensSemaine = sessions.filter((s: any) => s.date_examen >= today && s.date_examen <= dans7).length;

    return {
      ventesMois, caMois, examensSemaine, aConvoquer,
      preinscriptions: preinsR.count ?? 0,
      listeAttente: attenteR.count ?? 0,
    };
  } catch {
    return zero;
  }
}

const ACCES: { href: string; icone: LucideIcon; titre: string; desc: string; primaire?: boolean }[] = [
  { href: "/examens/vente-groupe", icone: Plus, titre: "Inscrire un candidat", desc: "TEF IRN ou examen civique, en une action.", primaire: true },
  { href: "/examens/candidats", icone: Users, titre: "Candidats", desc: "Liste par session, état de chaque candidat." },
  { href: "/examens", icone: CalendarDays, titre: "Sessions", desc: "Planning des sessions — centre : Gagny." },
  { href: "/examens/jour", icone: CheckCircle2, titre: "Jour J", desc: "Candidats du jour, présence et déroulé." },
  { href: "/examens/corrections", icone: FileCheck, titre: "Résultats", desc: "Saisie et envoi des résultats." },
  { href: "/examens/preinscriptions", icone: Phone, titre: "Pré-inscriptions", desc: "Réservations par téléphone, en attente de paiement." },
  { href: "/examens/remboursements", icone: RotateCcw, titre: "Remboursements", desc: "Reports, avoirs et remboursements." },
  { href: "/examens/taux", icone: TrendingUp, titre: "Taux de réussite", desc: "Présentation et réussite par type et agence." },
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

export default async function HubExamen() {
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const k = await kpis(site);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <ClipboardList size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Espace Examen</h1>
            <p className="page-subtitle">TEF IRN &amp; examens civiques — centre d'examen : Gagny.</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icone={CheckCircle2} valeur={k.ventesMois} label="Ventes ce mois" ton="bg-emerald-100 text-emerald-700" />
        <Kpi icone={Banknote} valeur={eur(k.caMois)} label="CA examen ce mois" ton="bg-emerald-100 text-emerald-700" />
        <Kpi icone={CalendarDays} valeur={k.examensSemaine} label="Examens sous 7 jours" href="/examens" ton="bg-mystory-clair text-mystory-fonce" />
        <Kpi icone={Send} valeur={k.aConvoquer} label="À convoquer" href="/examens/candidats" ton="bg-amber-100 text-amber-700" />
        <Kpi icone={Phone} valeur={k.preinscriptions} label="Pré-inscriptions en attente" href="/examens/preinscriptions" ton="bg-amber-100 text-amber-700" />
        <Kpi icone={Hourglass} valeur={k.listeAttente} label="Liste d'attente" href="/examens/liste-attente" ton="bg-mystory-clair text-mystory-fonce" />
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Accès rapides</h2>
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
