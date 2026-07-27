// lib/suivi.ts — Définitions partagées du suivi pédagogique (livret de suivi).
export const CHECKLIST_JOUR_J: { cle: string; label: string }[] = [
  { cle: "convocation", label: "Convocation envoyée au candidat" },
  { cle: "identite", label: "Pièce d'identité vérifiée" },
  { cle: "inscription", label: "Inscription à l'examen confirmée (CCI)" },
  { cle: "paiement", label: "Paiement soldé" },
  { cle: "niveau_atteint", label: "Niveau visé atteint aux examens blancs" },
  { cle: "consignes", label: "Consignes et déroulé de l'épreuve rappelés" },
  { cle: "date_lieu", label: "Date et lieu de passage (Gagny) confirmés" },
];

// Scores TEF IRN : 0 à 699 par épreuve. Bandes de niveau indicatives (score global).
export const EPREUVES = ["ce", "co", "ee", "eo"] as const;
export const EPREUVE_LABEL: Record<string, string> = {
  ce: "Compréhension écrite", co: "Compréhension orale",
  ee: "Expression écrite", eo: "Expression orale",
};
