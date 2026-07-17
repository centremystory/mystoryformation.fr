# Audit du parcours apprenant (18 étapes) — 17/07/2026
| Étape | Écran | Docs | Alerte si manquant | Journal |
|---|---|---|---|---|
| 1-2 Lead / contact | `/messages` + relances auto | — | compteur accueil | ✅ |
| 3-5 Test initial → résumé → correction | `/test` chronométré → résumé → `/tests/[id]` + PDF interne | éval. initiale auto | tests à noter | ✅ |
| 6 Proposition formation | email conseils auto (formule recommandée) + conseiller | — | — | ✅ |
| 7 Fiche analyse besoin | `/dossiers` complétion + DocuSeal | PDF | pièce manquante | ✅ |
| 8-10 Convention/planning/règlement | génération + signature | PDF ×4 | pièces manquantes | ✅ |
| 11-13 Formation / émargement / suivi | `/emargement` (½ journée, 2 signatures) + suivi cours | feuilles PDF | anomalies | ✅ |
| 14-16 Éval. finale / attestation / certificat | test final auto + génération | PDF ×3 | verrou anti-antidate | ✅ |
| 17 Dossier complet | conformité EDOF `/dossiers/conformite` | export ZIP | scanner de risques | ✅ |
| 18 Archivage | statut + RGPD (anonymisation à terme) | — | — | ✅ |
**Trous identifiés** : étape 2 (appels/RDV) sans module dédié (Google Sheet historique) — décision P2 ; le reste : chaîne continue, chaque étape a écran + document + alerte + trace.
