# Base de données MYSTORY — schéma & migrations

Ce dossier **versionne l'historique du schéma** de la base Supabase du CRM
(projet `svepgknbbonrtwyvzaar`).

## Source de vérité
- L'**historique canonique** des migrations est tenu par Supabase
  (`supabase_migrations.schema_migrations`) : chaque changement de schéma y est
  enregistré, horodaté et nommé.
- `migrations/MANIFEST.md` reflète cet historique (version + nom), dans l'ordre.

## Règles MYSTORY appliquées au schéma
- **Aucun `DELETE`** : archivage via `actif = false` ou un `statut` (annulé / archivé).
- **Anti-antidatage** : horodatages posés côté serveur (`now()`), déclencheurs `before` qui forcent l'horodatage.
- **RLS activée** sur les tables ; accès applicatif via `service_role` (les routes serveur), jamais via un client anonyme.
- **Traçabilité 5 ans** : tables de suivi immuables (ex. `remarques`), journal d'audit.

## Faire évoluer le schéma
1. Appliquer la migration sur Supabase (dashboard ou outil de migration), avec un **nom explicite**.
2. Reporter la ligne (version + nom) dans `migrations/MANIFEST.md`.
3. Idéalement, déposer aussi le `.sql` de la migration dans `migrations/` (un fichier par migration : `<version>_<nom>.sql`).

## Reconstruire le schéma complet en local (DDL intégral)
Avec la CLI Supabase :
```bash
supabase login
supabase link --project-ref svepgknbbonrtwyvzaar
supabase db pull        # génère les fichiers SQL de migration en local
```
(ou export depuis le dashboard Supabase → Database → Migrations / Backups)
