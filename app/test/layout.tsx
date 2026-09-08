/**
 * Layout des pages publiques de test.
 *
 * 08/09/2026 : la marque a été retirée volontairement. Le test de positionnement
 * est neutre pour pouvoir servir à plusieurs organismes ; l'identité de celui qui
 * fait passer le test figure dans le courriel de résultats, pas sur l'épreuve.
 * La largeur n'est plus contrainte ici : chaque page décide de la sienne.
 */
export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/60">
      <div className="flex w-full flex-col pb-10 pt-6">{children}</div>
      <footer className="pb-8 text-center text-xs text-gray-400">
        Test de positionnement — il ne remplace pas l&apos;examen officiel et ne délivre aucune attestation de niveau.
      </footer>
    </div>
  );
}
