// app/examens/vente — l'inscription examen est désormais unifiée sur /examens/vente-groupe
// (un panier d'un seul examen = inscription simple). On redirige pour les liens/favoris existants.
import { redirect } from "next/navigation";

export default function VenteRedirige() {
  redirect("/examens/vente-groupe");
}
