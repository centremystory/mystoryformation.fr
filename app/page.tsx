// app/page.tsx — Accueil du CRM : tableau de bord de l'équipe
// Compteurs en temps réel (lecture seule, service_role côté serveur) + accès aux modules.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function compter() {
  const zero = { enCours: 0, complets: 0, aRelancer: 0, fleOk: 0, fleTotal: 0 };
  try {
    const [incomplets, complets, relances, formatrices] = await Promise.all([
      supabaseAdmin.from("dossiers").select("id", { count: "exact", head: true }).eq("statut", "incomplet"),
      supabaseAdmin.from("dossiers").select("id", { count: "exact", head: true }).eq("statut", "complet"),
      supabaseAdmin.from("v_conventions_a_relancer").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("formatrices").select("justificatif_fle").eq("actif", true),
    ]);
    const actives = formatrices.data ?? [];
    return {
      enCours: incomplets.count ?? 0,
      complets: complets.count ?? 0,
      aRelancer: relances.count ?? 0,
      fleOk: actives.filter((f) => f.justificatif_fle).length,
      fleTotal: actives.length,
    };
  } catch {
    return zero; // le tableau de bord s'affiche même si la base est indisponible
  }
}

function Compteur({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: "ambre" | "vert" }) {
  const couleur = accent === "ambre" ? "text-amber-600" : accent === "vert" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{libelle}</p>
      <p className={`text-2xl font-semibold ${couleur}`}>{valeur}</p>
    </div>
  );
}

export default async function Accueil() {
  const c = await compter();
  const heure = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit" });
  const salut = parseInt(heure) < 18 ? "Bonjour" : "Bonsoir";

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900">{salut} 👋</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Voici où en sont les dossiers aujourd'hui.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Compteur libelle="Dossiers en cours" valeur={String(c.enCours)} />
        <Compteur libelle="Dossiers complets" valeur={String(c.complets)} accent="vert" />
        <Compteur libelle="Conventions à relancer" valeur={String(c.aRelancer)} accent={c.aRelancer > 0 ? "ambre" : undefined} />
        <Compteur libelle="Formatrices en règle" valeur={`${c.fleOk} / ${c.fleTotal}`} accent={c.fleOk === c.fleTotal ? "vert" : "ambre"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dossiers"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">📋</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Suivi des dossiers</p>
          <p className="text-sm text-gray-500 mt-1">Complet / incomplet et pièces à traiter, dossier par dossier.</p>
        </Link>

        <Link href="/inscriptions/nouvelle"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">＋</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Nouvelle inscription</p>
          <p className="text-sm text-gray-500 mt-1">Fiche stagiaire, planning et contractualisation en une saisie.</p>
        </Link>

        <Link href="/equipe"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">👥</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Équipe</p>
          <p className="text-sm text-gray-500 mt-1">Formateurs, justificatifs FLE et conformité en un coup d'œil.</p>
        </Link>

        <a href="/qcm" target="_blank" rel="noreferrer"
           className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">📝</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Test de positionnement</p>
          <p className="text-sm text-gray-500 mt-1">Le QCM candidat, à ouvrir ou partager pour un test initial.</p>
        </a>
      </div>

    </main>
  );
}
