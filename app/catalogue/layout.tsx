import Onglets from "@/components/Onglets";
import { ONGLETS_REGLAGES } from "@/lib/onglets";

/** Même bandeau que Réglages (Réglages · Centres · Catalogue · Offres) → retour possible. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_REGLAGES} />
      {children}
    </>
  );
}
