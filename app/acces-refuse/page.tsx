// app/acces-refuse/page.tsx — 403 : la page demandée n'est pas dans le périmètre du rôle.
import Link from "next/link";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AccesRefuse() {
  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-mystory-clair text-mystory-fonce">
        <Lock size={26} strokeWidth={1.75} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Accès refusé</h1>
      <p className="mt-3 text-sm text-gray-600">
        Cette page n'est pas accessible avec votre rôle. Si vous pensez qu'il s'agit d'une erreur,
        contactez la Direction pour ajuster vos accès.
      </p>
      <Link href="/" className="btn-primary mt-6">Retour à l'accueil</Link>
    </main>
  );
}
