import { redirect } from "next/navigation";

// Catalogue fusionné : une seule page = Offres & formules (source de vérité qui pilote
// inscriptions + prix). L'ancienne grille « Tarifs & formations » (table formules) est retirée.
export default function CatalogueRedirect() {
  redirect("/catalogue/offres");
}
