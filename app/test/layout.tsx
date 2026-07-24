import Image from "next/image";

/**
 * Layout de marque des pages publiques de test (test.mystoryformation.fr /
 * testfinale.mystoryformation.fr). Logo MYSTORY + fond dégradé + pied de page,
 * appliqué à toutes les pages /test (accueil, finale, kiosque, passage).
 */
export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/60">
      <header className="flex items-center justify-center gap-2.5 px-4 pt-8 pb-2">
        <Image src="/embleme-bleu.png" alt="MYSTORY" width={40} height={40} priority className="h-9 w-9 object-contain" />
        <span className="text-lg font-bold tracking-tight text-mystory-fonce">MYSTORY</span>
        <span className="ml-1 rounded-full bg-mystory/10 px-2 py-0.5 text-[11px] font-semibold text-mystory">Formation</span>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-10">{children}</div>
      <footer className="pb-8 text-center text-xs text-gray-400">
        MYSTORY Formation · 3 bis av. de Gagny, 93220 Gagny · contact@mystoryformation.fr
      </footer>
    </div>
  );
}
