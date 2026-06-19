// app/examen/page.tsx — Hub de l'espace EXAMEN (TEF IRN & examens civiques)
// Page de navigation : les cartes mènent aux modules examen. URLs inchangées.
// Centre d'examen unique : Gagny.
import Link from "next/link";
import {
  ClipboardList, Plus, Users, CalendarDays, CheckCircle2, FileCheck, Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const CARTES: { href: string; icone: LucideIcon; titre: string; desc: string; primaire?: boolean }[] = [
  { href: "/examens/vente", icone: Plus, titre: "Inscription Examen",
    desc: "Inscrire un candidat (TEF IRN ou examen civique) en une seule action.", primaire: true },
  { href: "/examens/candidats", icone: Users, titre: "Candidats inscrits",
    desc: "Liste des candidats par session (TEF & civique), filtrable par agence." },
  { href: "/examens", icone: CalendarDays, titre: "Sessions d'examen",
    desc: "Planning des sessions — centre d'examen : Gagny." },
  { href: "/examens/jour", icone: CheckCircle2, titre: "Jour J",
    desc: "Candidats du jour, présence et déroulé de la session." },
  { href: "/examens/corrections", icone: FileCheck, titre: "Corrections",
    desc: "Saisie et suivi des corrections d'examens." },
  { href: "/classement", icone: Trophy, titre: "Classement vendeurs",
    desc: "Ventes et primes par vendeur et par agence." },
];

export default function HubExamen() {
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARTES.map((c) => {
          const Icone = c.icone;
          if (c.primaire) {
            return (
              <Link key={c.href} href={c.href}
                className="group rounded-2xl border border-mystory bg-mystory p-5 text-white shadow-soft transition hover:bg-mystory-fonce hover:shadow-pop">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                  <Icone size={20} strokeWidth={1.75} />
                </div>
                <p className="mt-3 font-semibold">{c.titre}</p>
                <p className="mt-1 text-sm text-blue-50">{c.desc}</p>
              </Link>
            );
          }
          return (
            <Link key={c.href} href={c.href} className="card card-hover group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mystory-clair text-mystory-fonce">
                <Icone size={20} strokeWidth={1.75} />
              </div>
              <p className="mt-3 font-semibold text-gray-900 group-hover:text-mystory">{c.titre}</p>
              <p className="mt-1 text-sm text-gray-500">{c.desc}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
