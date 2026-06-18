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

## Backfill / import de données historiques ⚠️
Certains déclencheurs `before` protègent les données du **présent** mais feraient
**échouer un import de données passées**. Avant un backfill massif, les **désactiver**,
faire l'import, puis les **réactiver** :

| Trigger | Table | Pourquoi le désactiver avant un backfill |
|---|---|---|
| `trg_ventes_examen_before` | `ventes_examen` | Attribue numéros/verrous et force l'horodatage — incompatible avec des lignes historiques antidatées. |
| `trg_ventes_capacite` | `ventes_examen` | Rejette toute inscription au-delà de `sessions_examen.capacite` — un import de sessions passées remplies au-delà de la capacité échouerait. |

```sql
alter table ventes_examen disable trigger trg_ventes_examen_before;
alter table ventes_examen disable trigger trg_ventes_capacite;
-- … import des lignes historiques …
alter table ventes_examen enable trigger trg_ventes_capacite;
alter table ventes_examen enable trigger trg_ventes_examen_before;
```

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
