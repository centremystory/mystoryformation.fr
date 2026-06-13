// app/formation/page.tsx — Hub de l'espace FORMATION (parcours stagiaire CPF)
// Page de navigation : les cartes mènent aux modules formation. URLs inchangées.
import Link from "next/link";

const CARTES = [
  { href: "/inscriptions/nouvelle", icone: "＋", titre: "Inscription Formation",
    desc: "Fiche stagiaire, planning et contractualisation en une seule saisie.", primaire: true },
  { href: "/dossiers", icone: "📋", titre: "Suivi des dossiers",
    desc: "Complet / incomplet et pièces à traiter, dossier par dossier." },
  { href: "/positionnements", icone: "📝", titre: "Tests de positionnement",
    desc: "Résultats des QCM candidats à traiter et niveaux à noter." },
  { href: "/emargement", icone: "✍️", titre: "Émargement",
    desc: "Feuilles d'émargement par demi-journée, signées stagiaire + formateur." },
  { href: "/edof", icone: "📥", titre: "Import EDOF",
    desc: "Réconciliation EDOF → CRM : numéros, heures et dates de validation." },
];

export default function HubFormation() {
  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎓 Espace Formation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Le parcours stagiaire CPF — de l'inscription au certificat de réalisation.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARTES.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`group rounded-xl p-5 border transition-all hover:shadow-sm ${
              c.primaire ? "bg-mystory text-white border-mystory" : "bg-white border-gray-200 hover:border-mystory"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
              c.primaire ? "bg-white/20 text-white" : "bg-mystory-clair text-mystory"
            }`}>{c.icone}</div>
            <p className={`font-semibold mt-3 ${c.primaire ? "text-white" : "text-gray-900 group-hover:text-mystory"}`}>{c.titre}</p>
            <p className={`text-sm mt-1 ${c.primaire ? "text-blue-50" : "text-gray-500"}`}>{c.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
