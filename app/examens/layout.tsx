import ExamenSousNav from "@/components/ExamenSousNav";

/** Enveloppe toutes les pages /examens/* avec la sous-navigation par onglets. */
export default function ExamensLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ExamenSousNav />
      {children}
    </>
  );
}
