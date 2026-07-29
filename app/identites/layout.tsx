import FormationSousNav from "@/components/FormationSousNav";

/** Insère la sous-navigation par onglets du module Formation (famille Dossiers). */
export default function FormationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FormationSousNav />
      {children}
    </>
  );
}
