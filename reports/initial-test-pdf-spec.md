# Spec — PDF du test initial — 17/07/2026
## Implémenté
1. **Évaluation initiale** (auto à la notation) : identité, date, niveaux par épreuve, niveau global, objectif — versionnée, archivée bucket privé.
2. **Correction détaillée** `GET /api/tests/[id]/correction-pdf` (`dd5ab5e`) : bandeau niveau /20, 4 scores, tableaux CE & CO (énoncé, réponse candidat, bonne réponse, points ✓/✗ vert/rouge), rédaction EE + sujet + note, EO + remarques formatrice, mentions légales. **INTERNE** (auth équipe, bandeau confidentiel, remise en main propre) — jamais emailé : contient les corrigés de la banque.
## Règle « ne pas inventer »
Aucune explication pédagogique générée automatiquement : si l'analyse fine (grammaire/vocabulaire/cohérence de l'EE, commentaire par question) n'est pas saisie par la formatrice, le PDF n'affiche que le factuel + la mention des remarques. Extension P2 : champs de correction EE structurés dans l'écran de notation, repris dans le PDF.
