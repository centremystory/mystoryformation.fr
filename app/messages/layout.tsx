import Onglets from "@/components/Onglets";
import { ONGLETS_MESSAGERIE } from "@/lib/onglets";

/** Hub Messagerie (Communication) : fil d'équipe · questions internes · messages prospects. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Onglets onglets={ONGLETS_MESSAGERIE} />
      {children}
    </>
  );
}
