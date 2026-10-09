-- ============================================================================
-- La déclaration de carence, conservée sur la commande en ligne
-- Date : 09/10/2026
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar.
--    Éprouvée par une insertion jouée dans un bloc `DO $$ … raise exception $$`
--    (le `raise` annule tout) : une commande portant les quatre champs est
--    acceptée et relue avec les bonnes valeurs. Rien n'est resté écrit, aucune
--    ligne existante n'a été touchée.
--
-- ── CE QUE ÇA RÉPARE ────────────────────────────────────────────────────────
-- Depuis le 09/10, le site vitrine POSE la question au candidat — « avez-vous
-- passé un test de français dans les 20 derniers jours ? », « un examen
-- civique dans les 48 dernières heures ? » — et lui écrit, noir sur blanc :
-- « ces réponses partent avec votre réservation et sont vérifiées par notre
-- secrétariat ».
--
-- C'était faux. Le site envoyait bien `carence_tef`, `carence_tef_dernier`,
-- `carence_civique` et `carence_civique_dernier` dans l'URL de `/commande`,
-- mais le CRM ne lisait aucun de ces paramètres : la déclaration n'arrivait
-- nulle part, personne ne la voyait, rien ne la stockait.
--
-- Et ce ne sont pas nos règles, ce sont celles du CERTIFICATEUR : 20 jours
-- calendaires entre deux TEF IRN, 48 heures entre deux examens civiques. Un
-- résultat obtenu en violant une carence est REFUSÉ. Le candidat a payé, s'est
-- déplacé, passé l'épreuve — et n'a rien. C'est nous qui avons encaissé.
--
-- ── POURQUOI QUATRE COLONNES, ET PAS DU JSON ────────────────────────────────
-- `detail` (jsonb) porte déjà le devis ligne à ligne. On aurait pu y glisser la
-- déclaration. Rejeté : `detail` est une PHOTO du prix affiché, qu'on relit
-- pour répondre à « pourquoi ai-je payé 660 € ». La déclaration, elle, est une
-- donnée qu'on voudra filtrer et croiser — « quelles commandes portent une
-- déclaration positive ? » — et un champ qu'on interroge mérite une colonne.
--
-- ── CE QUI N'EST PAS ICI, VOLONTAIREMENT ────────────────────────────────────
-- Aucune contrainte « la session doit respecter la carence déclarée ». Deux
-- raisons, et la seconde est la plus importante :
--
--   1. une déclaration est un SIGNAL, pas une preuve : le candidat peut se
--      tromper d'année en saisissant sa date, et une contrainte de base le
--      refuserait sans recours ;
--   2. une déclaration qui BLOQUE la vente devient une déclaration à laquelle
--      on répond toujours « non ». On perdrait alors la seule fenêtre qu'on ait
--      sur un passage effectué AILLEURS — précisément ce que notre historique
--      ne peut pas voir.
--
-- Le contrôle dur existe déjà et il porte sur des faits : le trigger
-- `ventes_examen_carence_bloquante` et `checkInscriptionExamen()` refusent la
-- conversion sur l'historique RÉEL du candidat. Ici, on conserve et on alerte.
--
-- Pas de `check (… <= current_date)` non plus pour interdire une date de
-- passage dans le futur, bien que la tentation soit forte : `current_date`
-- n'est pas immuable, et une contrainte qui dépend du jour se réévalue au
-- rechargement d'un `pg_dump` — la sauvegarde d'aujourd'hui refuserait de se
-- restaurer demain. Une date dans le futur est donc neutralisée par la route,
-- qui la traite comme une saisie illisible et le signale au secrétariat.
-- ============================================================================

alter table commandes_en_ligne
  -- `true` = « oui, j'ai passé cette épreuve récemment », `false` = « non ».
  -- NULL = la question ne s'appliquait pas (épreuve non commandée) ou la
  -- déclaration n'a pas été transmise. Les trois cas sont distincts et doivent
  -- le rester : un `false` par défaut ferait passer une absence de réponse pour
  -- une réponse rassurante, ce qui est exactement l'inverse de ce qu'on veut.
  add column if not exists carence_tef_declaree             boolean,
  add column if not exists carence_tef_dernier_passage      date,
  add column if not exists carence_civique_declaree         boolean,
  add column if not exists carence_civique_dernier_passage  date;

comment on column commandes_en_ligne.carence_tef_declaree is
  'Déclaration du candidat : test de français passé dans les 20 derniers jours (NULL = non demandée ou non transmise). Signal, pas preuve.';
comment on column commandes_en_ligne.carence_civique_declaree is
  'Déclaration du candidat : examen civique passé dans les 48 dernières heures (NULL = non demandée ou non transmise). Signal, pas preuve.';

-- Retrouver les commandes à regarder : celles où le candidat a déclaré un
-- passage récent. Partiel, parce que la très grande majorité des commandes
-- répondent « non » et n'ont rien à signaler.
create index if not exists idx_commandes_carence_declaree
  on commandes_en_ligne (cree_le desc)
  where carence_tef_declaree is true or carence_civique_declaree is true;

-- ============================================================================
-- Reporté dans migrations/MANIFEST.md sous le n° 82.
-- ============================================================================
