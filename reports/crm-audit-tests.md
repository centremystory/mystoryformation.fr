# Tests fonctionnels — 17/07/2026
## Automatisés (en place)
CI GitHub : `tsc --noEmit` + `next build` à chaque push (env factices). Vérifs structurelles : 0 GET sans force-dynamic, 0 « agréé », mentions 17/17 (scripts d'audit rejouables).
## Manuels (checklist — à dérouler au test live puis à chaque évolution majeure)
1. **Test initial** : EO absente des étapes CE/CO/EE ✓ · distance = enregistrement ✓ · sur place = 3 étapes + notation examinateur ✓ · écoute unique CO ✓ · chrono auto-avance ✓ · résumé final ✓ · email résultats ✓ · correction PDF ✓ (marque « remise en main propre »).
2. **Fiche analyse besoin** : bouton visible · pré-remplissage · objectif professionnel bloquant · PDF archivé · statut pièce.
3. **PDF** : aucune balise vide · dates/durées/niveaux cohérents · mentions légales · signatures.
4. **Suivi dossier** : manquants visibles · complet impossible si pièce absente · journal.
5. **Sécurité/RGPD** : pages internes → 401 sans session · PDF via URLs signées · pas de données perso dans les logs · corrigés jamais dans les réponses candidates.
