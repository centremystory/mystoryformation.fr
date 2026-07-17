# Audit UX/UI — 17/07/2026
## Pages prioritaires
| Page | Constat | Action |
|---|---|---|
| `/tests/banque` | Mise en page brute (liste plate, pas de filtre) | ✅ **Corrigé aujourd'hui** : recherche, filtres initiaux/finaux + actifs/archivés, badges, compteurs (`09d8988`) |
| `/test/[token]` | EO répétée sous chaque étape (bug), pas de résumé final | ✅ **Corrigé** : étapes verrouillées chronométrées, EO selon modalité, résumé de fin (`e670336`) |
| `/dossiers` | 1 364 lignes, page dense mais fonctionnelle ; formulaires de complétion peu visibles | 🟠 P2 : refactor en composants + mise en avant des pièces « à compléter » |
| `/fiche/[id]` | Fiche 360 récente, cohérente | ✅ |
| `/examens/*` | Hub riche, sous-navigation claire | ✅ |
## Constats transverses
Responsive : AppShell + grilles Tailwind OK mobile. Wording : harmonisé (habilité, pas d'« agréé »). Dette : 426 `any` (P2), refactor `/dossiers` (P2). Erreurs : formulaires publics affichent les erreurs ; le formulaire de complétion remonte `onErreurs` — visibilité à re-tester au test live.
