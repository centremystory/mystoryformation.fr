-- ============================================================================
-- Rendez-vous en ligne : un JETON ALÉATOIRE au lieu d'une signature dérivée
-- Date : 09/10/2026 (complète les migrations 79 et 80, le même jour)
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar (migration
--    `rendez_vous_jeton_aleatoire`). Purement additive : deux colonnes nullables
--    et un index unique partiel. Les rendez-vous existants restent valides,
--    `jeton` à NULL.
--    L'unicité a été ÉPROUVÉE dans un bloc `DO $$ … raise exception $$` (le
--    `raise` annule la transaction, rien n'est resté écrit) :
--      1. deux rendez-vous portant le même jeton → REFUSÉ (unique_violation) ;
--      2. plusieurs rendez-vous à `jeton` NULL → ACCEPTÉS (l'index est partiel,
--         sinon tous les rendez-vous confirmés entreraient en conflit sur NULL).
--
-- ── POURQUOI PAS UNE SIGNATURE DE L'IDENTIFIANT ─────────────────────────────
--
-- La première version du lien de confirmation signait l'identifiant du
-- rendez-vous — `HMAC(AUTH_SECRET, id)` — sur le modèle de
-- `lib/jetonCorrection.ts`, qui fait ça très bien pour son usage. Une revue de
-- sécurité l'a contestée pour CELUI-CI, et elle avait raison.
--
-- Ce lien est la SEULE chose qui prouve que l'adresse e-mail saisie appartient
-- au demandeur. S'il est contournable, le double opt-in ne protège plus rien et
-- ne laisse qu'une couche de complexité en plus — on revient à l'épuisement des
-- créneaux et à l'expédition de courriels vers des tiers depuis notre domaine.
--
-- Quatre propriétés sont exigées d'un tel jeton. La signature dérivée n'en
-- tenait que deux :
--
--   — IMPRÉVISIBLE ✓ : l'HMAC l'était aussi, sans le secret ;
--   — LIÉ À CE RENDEZ-VOUS ✓ : les deux le sont ;
--   — EXPIRANT ✗ : une signature de l'identifiant ne périme JAMAIS. Elle reste
--     valable des mois plus tard, dans un courriel transféré, un journal de
--     proxy ou l'historique d'un navigateur partagé ;
--   — À USAGE UNIQUE ✗ : et surtout, étant une FONCTION de l'identifiant, elle
--     ne peut pas être révoquée sans faire tourner `AUTH_SECRET` — ce qui
--     casserait du même coup tous les autres liens signés du CRM.
--
-- 32 octets d'aléa cryptographique (256 bits) rangés en base les tiennent
-- toutes les quatre : rien à deviner, unique par index, périmé avec la
-- réservation qu'il confirme (`cree_le + DELAI_CONFIRMATION_HEURES`, la même
-- fenêtre que la péremption), et EFFACÉ à l'usage.
--
-- ⚠️ Le jeton ne contient AUCUNE information : ni l'identifiant du rendez-vous,
-- ni l'adresse. C'est volontaire — ce lien atterrit dans des boîtes, des
-- journaux de serveur et des antivirus de messagerie. Il sert de clé, pas de
-- message.
--
-- `jeton_utilise_le` garde la trace du clic après l'effacement du jeton : c'est
-- le seul moyen de distinguer, plus tard, « confirmé par le candidat » de
-- « confirmé d'office par nous ».
-- ============================================================================

alter table rendez_vous
  add column if not exists jeton text,
  add column if not exists jeton_utilise_le timestamptz;

-- Partiel sur `jeton is not null` : le jeton est effacé après usage, donc tous
-- les rendez-vous confirmés l'ont à NULL et entreraient en conflit sans cela.
create unique index if not exists rendez_vous_jeton_unique
  on rendez_vous (jeton) where jeton is not null;

-- ============================================================================
-- À reporter dans migrations/MANIFEST.md sous le n° 81.
-- ============================================================================
