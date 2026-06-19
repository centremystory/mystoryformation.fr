// app/acces-refuse/page.tsx — 403 : la page demandée n'est pas dans le périmètre du rôle.
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AccesRefuse() {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-bold text-gray-900">Accès refusé</h1>
      <p className="text-sm text-gray-600 mt-3">
        Cette page n'est pas accessible avec votre rôle. Si vous pensez qu'il s'agit d'une erreur,
        contactez la Direction pour ajuster vos accès.
      </p>
      <Link href="/"
            className="inline-block mt-6 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-medium hover:opacity-90 transition-opacity">
        Retour à l'accueil
      </Link>
    </main>
  );
}
