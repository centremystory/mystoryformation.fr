import Onglets from "@/components/Onglets";
import { ONGLETS_COMMERCIAL } from "@/lib/onglets";

/** Hub Commercial : cockpit + liste des ventes formation. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_COMMERCIAL} />
      {children}
    </>
  );
}
