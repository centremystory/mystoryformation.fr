# PHASE CRM AUDIT QUALIOPI — SYNTHÈSE (17/07/2026)
1. **Audité** : 76 pages, 132 APIs, 17 gabarits PDF, 68 tables/55 triggers, parcours apprenant 18 étapes, conformité Qualiopi/CDC/RGPD.
2. **Conforme** : chaîne documentaire complète (12 pièces, ordre d'audit), mentions 17/17, preuves techniques (anti-antidate, séquences, source unique niveaux, double signature, émargement ½ journée), indicateurs 8/11/30/31/32, veille, sous-traitance, RGPD (anonymisation, 10 ans factures).
3. **Partiellement conforme** : ind. 26 (référent handicap à désigner formellement) ; test live jamais exécuté ; DPA à archiver.
4. **Non conforme** : rien côté logiciel.
5. **Bugs corrigés (aujourd'hui)** : EO répétée sous chaque étape · absence de résumé final · absence de logique distance/sur place · banque de tests illisible · relances inertes (cron Vercel natif).
6. **Bugs restants** : blocage fiche d'analyse (non reproduit — plan de reproduction au test live).
7. **Pages à améliorer (P2)** : `/dossiers` (refactor), notation EO structurée.
8. **PDF à corriger** : aucun défaut statique ; contrôle visuel final au test live.
9. **Documents manquants** : aucun dans la chaîne stagiaire.
10. **Risques Qualiopi** : organisationnels uniquement (référent handicap, alimentation continue de la veille).
11. **Risques CDC/CPF** : néant structurel ; vigilance : jamais d'antidate sur anciens dossiers (sujet avocat).
12. **Risques RGPD** : faibles — DPA à archiver, R6 (Aircall→Meta) maintenu INACTIF sans brique consentement.
13. **P0 : vide · P1 : reproduction fiche + env Vercel + test live · P2/P3** : voir roadmap.
14. **À valider humainement** : référent handicap, DPA, exécution test live, décision module pipeline leads.
15. **Comment tester** : `docs/TEST-LIVE.md` (20 min, guidé) + checklist `reports/crm-audit-tests.md`.
