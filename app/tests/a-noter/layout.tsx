import Onglets from "@/components/Onglets";
import { ONGLETS_TESTS } from "@/lib/onglets";

/** Hub à onglets (fusion de pages liées). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_TESTS} />
      {children}
    </>
  );
}
