// components/ui/Card.tsx — Carte standard (bordure + fond blanc + arrondi cohérents).
import type { ReactNode } from "react";

export default function Card({
  children, className = "", padded = true,
}: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${padded ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}
