// app/formation/page.tsx — Hub de l'espace FORMATION (parcours stagiaire CPF)
// Page de navigation : les cartes mènent aux modules formation. URLs inchangées.
import Link from "next/link";
import {
  GraduationCap, Plus, ClipboardList, CalendarDays, TrendingUp, FileText, Signature, Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AlertesFormation from "./AlertesFormation";

const CARTES: { href: string; icone: LucideIcon; titre: string; desc: string; primaire?: boolean }[] = [
  { href: "/inscriptions/nouvelle", icone: Plus, titre: "Inscription Formation",
    desc: "Fiche stagiaire, planning et contractualisation en une seule saisie.", primaire: true },
  { href: "/dossiers", icone: ClipboardList, titre: "Suivi des dossiers",
    desc: "Complet / incomplet et pièces à traiter, dossier par dossier." },
  { href: "/planning", icone: CalendarDays, titre: "Planning des élèves",
    desc: "Séances de formation par site (Gagny / Sarcelles), filtrables et à venir." },
  { href: "/suivi-eleves", icone: TrendingUp, titre: "Suivi des élèves",
    desc: "Progression des heures, absences et prochaine séance, par élève." },
  { href: "/positionnements", icone: FileText, titre: "Tests de positionnement",
    desc: "Résultats des QCM candidats à traiter et niveaux à noter." },
  { href: "/emargement", icone: Signature, titre: "Émargement",
    desc: "Feuilles d'émargement par demi-journée, signées stagiaire + formateur." },
  { href: "/edof", icone: Download, titre: "Import EDOF",
    desc: "Réconciliation EDOF → CRM : numéros, heures et dates de validation." },
];

export default function HubFormation() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <GraduationCap size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Espace Formation</h1>
            <p className="page-subtitle">Le parcours stagiaire CPF — de l'inscription au certificat de réalisation.</p>
          </div>
        </div>
      </header>

      <AlertesFormation />

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
