// components/ui/EmptyState.tsx — État vide standard.
import type { ReactNode } from "react";

export default function EmptyState({
  titre, sousTitre, action, emoji = "📭",
}: { titre: string; sousTitre?: string; action?: ReactNode; emoji?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-14 text-center">
      <div className="text-3xl">{emoji}</div>
      <p className="mt-3 text-sm font-medium text-gray-700">{titre}</p>
      {sousTitre && <p className="mt-1 max-w-sm text-sm text-gray-500">{sousTitre}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
