# Audit des PDF générés — 17/07/2026
## Contrôles statiques (17/17 gabarits `templates/`)
| Contrôle | Résultat |
|---|---|
| NDA 11756521775 + « ne vaut pas agrément » | ✅ 17/17 |
| Lieu/« Fait à » = Gagny | ✅ 17/17 (+ forçage serveur) |
| Identité organisme (SIRET/RCS) | ✅ |
| Charte (bleu #2F72DE, cachet 3 sites sans Paris) | ✅ |
| Balises non mappées | ✅ Aucune (mapping mergeEngine complet, valeurs par défaut sûres) |
| Cohérence dates/durée/niveaux | ✅ Structurelle (source unique dossier ; attestation ← `niveau_atteint`) |
## À l'œil humain (test live)
Le rendu visuel réel (pagination, signatures apposées DocuSeal, cachet) sera contrôlé sur les PDF produits par le dossier TEST PARCOURS — les 12 pièces seront ouvertes une à une (étapes 4-8 de `docs/TEST-LIVE.md`).
