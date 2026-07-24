// components/ui/PageHeader.tsx — En-tête de page standard (titre + sous-titre + actions).
// Remplace les <h1> maison disparates et évite le doublon avec la topbar.
import type { ReactNode } from "react";

export default function PageHeader({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-mystory">{icon}</div>}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
