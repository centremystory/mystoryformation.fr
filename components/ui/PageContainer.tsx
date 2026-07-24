// components/ui/PageContainer.tsx — Conteneur de page standard (largeur + marges cohérentes).
// Uniformise l'alignement de toutes les pages (fini le 820px ici / 1000px là / pleine largeur ailleurs).
import type { ReactNode } from "react";

const LARGEURS = {
  etroit: "max-w-2xl",   // formulaires, détail
  normal: "max-w-4xl",   // pages standard
  large: "max-w-6xl",    // tableaux, listes denses
  plein: "max-w-none",   // pleine largeur (grands tableaux)
} as const;

export default function PageContainer({
  children, width = "large",
}: { children: ReactNode; width?: keyof typeof LARGEURS }) {
  return <div className={`mx-auto w-full ${LARGEURS[width]} px-1 pb-16`}>{children}</div>;
}
