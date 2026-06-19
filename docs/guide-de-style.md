# Guide de style MYSTORY — CRM (Design SaaS épuré)

> Référence courte pour migrer chaque page au nouveau style sans rien casser.
> Esprit : beaucoup de blanc, sidebar à gauche, icônes fines, ombres très douces, typo soignée.
> **Règle d'or : on ne touche jamais à la logique métier ni au gating par rôle — uniquement la présentation.**

## 1. Le squelette est déjà fourni
- `app/layout.tsx` → `<AppShell>` pose la **sidebar gauche** (filtrée par rôle) + la **topbar sticky**
  (titre de page, recherche globale, sélecteur de site) + le **drawer mobile**.
- Une page **n'a donc plus à gérer la navigation**. Elle fournit seulement son contenu.
- Conteneur recommandé en tête de chaque page :
  ```tsx
  <main className="mx-auto max-w-6xl px-4 py-8 md:px-6"> … </main>
  ```

## 2. Police & couleurs
- Police **Inter** (déjà appliquée globalement).
- Marque : `mystory` (#2F72DE) · `mystory-fonce` (#1F56B0) · `mystory-clair` (#EAF1FC).
- Sémantique : `success` (emerald) · `warning` (amber) · `danger` (rose). Fond app : `canvas` (#FAFBFC).
- Ombres : `shadow-soft` (cartes) · `shadow-pop` (survol / éléments flottants).
- **Plus d'emojis** dans l'UI : utiliser **lucide-react** (`size={18}` `strokeWidth={1.75}`).

## 3. Classes du design system (globals.css)
| Classe | Usage |
|---|---|
| `.page-header` / `.page-title` / `.page-subtitle` | En-tête de page (titre + sous-titre + actions) |
| `.card` / `.card-hover` | Carte de base / + effet de survol |
| `.kpi` / `.kpi-label` / `.kpi-value` | Carte chiffre (compteur) |
| `.btn-primary` / `.btn-ghost` / `.btn-danger` | Boutons (le ghost = secondaire) |
| `.badge` + `.badge-success/-warning/-danger/-neutral/-info` | Pastilles d'état |
| `.input` | Champs de formulaire |
| `.table` (+ `thead`/`tbody`) | Tableau (en-tête sticky, lignes zébrées) |
| `.empty-state` | État vide soigné (icône + message + action) |
| `.skeleton` | Bloc de chargement (au lieu d'un écran vide) |

## 4. Recettes courantes
**En-tête de page**
```tsx
<header className="page-header">
  <div>
    <h1 className="page-title">Titre</h1>
    <p className="page-subtitle">Sous-titre.</p>
  </div>
  <Link href="/…/nouveau" className="btn-primary"><Plus size={16} /> Ajouter</Link>
</header>
```

**Compteur (KPI)**
```tsx
<div className="kpi">
  <p className="kpi-label">Dossiers complets</p>
  <p className="kpi-value mt-1 text-success-700">12</p>
</div>
```

**Carte cliquable + badge**
```tsx
<Link href="/…" className="card card-hover flex items-center justify-between gap-3">
  <span className="text-sm text-gray-700">Libellé</span>
  <span className="badge badge-warning">3</span>
</Link>
```

**État vide**
```tsx
<div className="empty-state">
  <CheckCircle2 size={28} strokeWidth={1.75} className="text-success-600" />
  <p className="text-sm font-medium text-gray-700">Rien à afficher</p>
  <p className="text-xs text-gray-400">Message d'aide + action éventuelle.</p>
</div>
```

## 5. Méthode de migration (page par page)
1. Envelopper le contenu dans le conteneur `max-w-6xl`.
2. Remplacer l'ancien titre par `.page-header`/`.page-title`.
3. Remplacer les `div` bricolées par `.card`, les chiffres par `.kpi`, les boutons par `.btn-*`.
4. Remplacer chaque **emoji** par une **icône Lucide**.
5. Ajouter `.empty-state` là où une liste peut être vide, `.skeleton` sur les chargements.
6. **Ne modifier aucune requête Supabase ni route API.** Vérifier le build (`npx tsc --noEmit`).

> Page de référence déjà migrée : **`app/page.tsx`** (l'accueil). S'en inspirer pour le reste.
