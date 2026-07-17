# Inventaire CRM — 17/07/2026
## Un seul CRM
`centremystory/mystoryformation.fr` · https://crm.mystoryformation.fr · Next.js 14.2.35 / Supabase Pro (eu-west-1) / Vercel · **76 pages · 132 APIs · 37 libs · 68 tables · 55 triggers · 142 migrations · 36 203 lignes**. Référence complète : `docs/CRM-COMPLET.md`. Les systèmes « MYSTORY OS / LibreChat / ia.mystoryformation.fr » sont des agents IA d'équipe **hors périmètre** (autre infrastructure, aucun lien de données).
## Correspondance avec les modules attendus
| Module attendu | Dans le CRM | Écart |
|---|---|---|
| Leads / pipeline / appels / RDV | `messages_prospects` (formulaires contact + pré-inscription, relances auto), `seances_accueil`, `positionnements` | ❗ Pas de pipeline commercial complet (statuts d'appel, RDV) — historiquement Google Sheet ; à décider : brique « pipeline leads » P2 |
| Ventes / paiements | `ventes_examen`, ventes groupées, `classement` (par commercial), factures/avoirs/reçus | ✅ |
| Apprenants / suivi formation | fiche 360 `/fiche/[id]`, `/dossiers` (pièces, statuts, EDOF), émargement, évaluations auto | ✅ |
| Test initial | v2 chronométrée complète (voir initial-test-audit) | ✅ |
| Banque de tests | `/tests/banque` v2 (recherche, filtres, badges) | ✅ |
| Génération PDF | 17 gabarits + moteurs (mergeEngine, renderPdf, correction détaillée) | ✅ |
| Suivi dossier | checklist 12 pièces, manquants, alertes conformité EDOF, export ZIP | ✅ |
| Admin / paramètres | `/comptes` (rôles), `/automatisations`, formules en base, `/journal` | ✅ (pas d'éditeur de templates in-app : les gabarits vivent dans le repo — choix assumé, versionné par Git) |
