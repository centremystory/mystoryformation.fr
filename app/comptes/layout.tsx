import Onglets from "@/components/Onglets";
import { ONGLETS_COMPTES } from "@/lib/onglets";

/** Hub Comptes & accès : comptes + accès par rôle. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_COMPTES} />
      {children}
    </>
  );
}
