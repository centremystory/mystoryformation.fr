/**
 * MYSTORY — /desinscription
 *
 * Le lien du pied de campagne pointe ici. La page ne fait que déléguer à la route
 * API, qui enregistre l'opposition et rend la confirmation : on garde ainsi UNE
 * seule implémentation, celle qui vérifie la signature.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { e?: string; s?: string };
}) {
  const p = new URLSearchParams();
  if (searchParams.e) p.set("e", searchParams.e);
  if (searchParams.s) p.set("s", searchParams.s);
  redirect(`/api/desinscription?${p.toString()}`);
}
