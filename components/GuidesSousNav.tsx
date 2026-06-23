"use client";
// components/GuidesSousNav.tsx — Onglets du hub « FAQ & Guides ».
// Unifie FAQ + Guide Vendeurs + Guide Formatrices sous une même barre.
import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "/faq", label: "FAQ" },
  { href: "/techniques-vente", label: "Guide Vendeurs" },
  { href: "/guide-formatrices", label: "Guide Formatrices" },
];

export default function GuidesSousNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white px-4 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-1">
        {ONGLETS.map((o) => {
          const actif = pathname === o.href || pathname.startsWith(o.href + "/");
          return (
            <Link key={o.href} href={o.href}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${actif ? "border-mystory text-mystory" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
              {o.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
