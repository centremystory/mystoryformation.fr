import { redirect } from "next/navigation";

// « Rapport hebdo » a fusionné avec « Mon rapport et mes tâches » (page unique /mon-rapport).
export default function RapportHebdoRedirect() {
  redirect("/mon-rapport");
}
