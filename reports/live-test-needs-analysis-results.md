# Résultat — fiche d'analyse du besoin « ne se génère pas pour remplir » — 22/07/2026

Le test live navigateur n'a pas été nécessaire : l'extension Chrome n'était pas connectée,
et **la lecture complète du circuit a confirmé la cause racine sans reproduction à l'aveugle**
(le test live ne servait qu'à rendre visible un mécanisme qu'on peut désormais lire dans le code).

- **Bug reproduit :** confirmé par analyse de code (mécanisme certain, non plus hypothétique).
- **Où ça bloque :** pas à l'ouverture du formulaire (il s'ouvre toujours — état client pur, le
  GET de pré-remplissage est best-effort avec `catch{}`). Le blocage est au **clic « Générer »**.
- **Cause identifiée (H1 confirmée) :** au clic, un verrou métier renvoie `409 gate_ko` avec la
  liste des raisons (le plus fréquent : **case « cohérence durée/écart » non cochée**, ou objectif /
  projet / disponibilités vides). Le `recap` était affiché **uniquement** dans un bandeau tout en
  haut de la carte dossier (`app/dossiers/page.tsx` L990), alors que le bouton « Générer » est en
  bas du formulaire (L1032). Sur un dossier à plusieurs pièces, le bandeau est **hors écran** →
  vécu comme « je clique et rien ne se passe / ça ne se génère pas ».
- **Statut HTTP observé (par le code) :** `409` (`status:"gate_ko"`, réponse avant toute écriture
  en base — le `upsert` completions est postérieur au verrou → reproduction sans mutation possible).
- **Fichier(s) concerné(s) :** `app/dossiers/page.tsx` (composant `FormulaireCompletion`).
- **Correction appliquée :** affichage des blocages **dans le formulaire, juste au-dessus du
  bouton** (état local `erreursLocales`) + `scrollIntoView` sur le bloc. **Aucun verrou métier
  modifié** — uniquement la visibilité du feedback. Le bandeau parent est conservé.
- **Non-régression :** logique serveur `/api/documents/completer` inchangée ; pré-remplissage,
  verrous (objectif pro, cohérence), archivage PDF, statut pièce, versionnage : intacts.
- **Risque :** très faible (changement purement additif côté affichage). Build `tsc` + `next build` verts.
- **Validation nécessaire :** vérifier sur la preview Vercel de la PR (ouvrir un dossier, cliquer
  « Générer » sans cocher la case → le blocage doit apparaître sous le bouton, visible immédiatement).
