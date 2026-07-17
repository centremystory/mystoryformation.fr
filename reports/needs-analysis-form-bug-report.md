# Bug — fiche d'analyse du besoin « ne se génère pas pour remplir » — 17/07/2026
## Constat de code (lecture complète du circuit)
Le circuit EXISTE et est cohérent : `/dossiers` → pièce `fiche_analyse_besoin` (COMPLETABLES) → bouton **« Compléter et générer »** → formulaire pré-rempli (GET `/api/documents/completer`) → POST (verrous : objectif professionnel obligatoire, case cohérence durée/écart) → fusion `templates/fiche_analyse_besoin.html` (Gagny forcé) → PDF archivé → pièce « généré » → option double signature DocuSeal (`fiche_besoin:<dossierId>`). Contrat GET/POST vérifié conforme au formulaire.
## Hypothèses du blocage observé (non reproductible hors prod : base à zéro)
H1 : erreur runtime au POST (DocuSeal/rendu) avec message peu visible · H2 : verrou métier (case cohérence non cochée / objectif vide) perçu comme panne · H3 : rôle sans permission (403) · H4 : le signalement concerne l'autre système (agents IA).
