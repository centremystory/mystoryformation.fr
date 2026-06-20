// app/examens — l'espace Examen ouvre sur son tableau de bord (/examen).
// Les sessions ont leur propre page : /examens/sessions.
import { redirect } from "next/navigation";

export default function ExamensIndex() {
  redirect("/examen");
}
