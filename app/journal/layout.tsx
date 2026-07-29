import Onglets from "@/components/Onglets";
import { ONGLETS_JOURNAL } from "@/lib/onglets";

/** Hub Journal & incidents techniques. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_JOURNAL} />
      {children}
    </>
  );
}
