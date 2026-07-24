// components/ui/Loading.tsx — Indicateur de chargement standard (fini les 3 styles maison différents).
export default function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-sm text-gray-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-mystory" />
      {label}
    </div>
  );
}

export function SkeletonLignes({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}
