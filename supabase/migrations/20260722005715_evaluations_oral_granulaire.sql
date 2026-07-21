-- MYSTORY — Modèle d'évaluation orale granulaire (test initial / positionnement).
--
-- Contexte : aujourd'hui la modalité orale est DÉDUITE du champ `auteur`
-- (passation : auteur commençant par "sur_place" => sur place, sinon distance),
-- et l'oral est stocké dans `oral_audios` (jsonb) + noté via `eo_sur10`.
-- Cette migration ajoute un modèle explicite et structuré, SANS rien supprimer.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS), aucune perte de données.
-- Rollback : voir le bloc "DOWN" commenté en fin de fichier.

-- 1) Colonnes granulaires sur evaluations -----------------------------------
alter table public.evaluations add column if not exists oral_evaluation_mode text;      -- remote_recording | onsite_examiner | not_required | pending
alter table public.evaluations add column if not exists oral_status text;               -- pending | submitted | evaluated | needs_review | not_applicable
alter table public.evaluations add column if not exists oral_score numeric;             -- note brute (ex. /10) saisie par l'examinateur
alter table public.evaluations add column if not exists oral_level_estimated text;       -- niveau CECRL estimé à l'oral (ex. A2, B1…)
alter table public.evaluations add column if not exists oral_examiner_comment text;
alter table public.evaluations add column if not exists oral_strengths text;             -- points forts
alter table public.evaluations add column if not exists oral_improvement_areas text;     -- axes d'amélioration
alter table public.evaluations add column if not exists oral_recommendation text;
alter table public.evaluations add column if not exists oral_audio_url text;             -- nullable : chemin bucket privé (jamais public)
alter table public.evaluations add column if not exists oral_audio_duration_seconds int; -- nullable
alter table public.evaluations add column if not exists oral_examiner_id text;           -- nullable : email/identifiant examinateur
alter table public.evaluations add column if not exists oral_evaluated_at timestamptz;   -- nullable
alter table public.evaluations add column if not exists oral_created_at timestamptz default now();
alter table public.evaluations add column if not exists oral_updated_at timestamptz default now();

-- 2) Contraintes de valeurs (idempotentes) ----------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'evaluations_oral_evaluation_mode_chk') then
    alter table public.evaluations add constraint evaluations_oral_evaluation_mode_chk
      check (oral_evaluation_mode is null or oral_evaluation_mode in
        ('remote_recording','onsite_examiner','not_required','pending'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluations_oral_status_chk') then
    alter table public.evaluations add constraint evaluations_oral_status_chk
      check (oral_status is null or oral_status in
        ('pending','submitted','evaluated','needs_review','not_applicable'));
  end if;
end $$;

-- 3) Backfill prudent des lignes existantes (aucune donnée écrasée) ----------
--    Déduction de la modalité comme le fait le code aujourd'hui, uniquement
--    quand la colonne est encore vide (idempotent au re-run).
update public.evaluations e set
  oral_evaluation_mode = case
    when coalesce(oral_audios::text, '[]') <> '[]' then 'remote_recording'
    when coalesce(auteur, '') like 'sur_place%'      then 'onsite_examiner'
    else 'pending'
  end
where e.oral_evaluation_mode is null;

update public.evaluations e set
  oral_status = case
    when eo_sur10 is not null                              then 'evaluated'
    when coalesce(oral_audios::text, '[]') <> '[]'         then 'submitted'
    when oral_evaluation_mode = 'not_required'             then 'not_applicable'
    else 'pending'
  end
where e.oral_status is null;

-- 4) Trigger de mise à jour de oral_updated_at ------------------------------
create or replace function public.tg_evaluations_oral_touch()
returns trigger language plpgsql as $$
begin
  new.oral_updated_at := now();
  return new;
end $$;

drop trigger if exists trg_evaluations_oral_touch on public.evaluations;
create trigger trg_evaluations_oral_touch
  before update of oral_evaluation_mode, oral_status, oral_score, oral_level_estimated,
                   oral_examiner_comment, oral_strengths, oral_improvement_areas,
                   oral_recommendation, oral_audio_url, oral_audio_duration_seconds,
                   oral_examiner_id, oral_evaluated_at
  on public.evaluations
  for each row execute function public.tg_evaluations_oral_touch();

-- ---------------------------------------------------------------------------
-- DOWN (rollback manuel si besoin — décommenter pour annuler) :
-- drop trigger if exists trg_evaluations_oral_touch on public.evaluations;
-- drop function if exists public.tg_evaluations_oral_touch();
-- alter table public.evaluations
--   drop constraint if exists evaluations_oral_evaluation_mode_chk,
--   drop constraint if exists evaluations_oral_status_chk,
--   drop column if exists oral_evaluation_mode, drop column if exists oral_status,
--   drop column if exists oral_score, drop column if exists oral_level_estimated,
--   drop column if exists oral_examiner_comment, drop column if exists oral_strengths,
--   drop column if exists oral_improvement_areas, drop column if exists oral_recommendation,
--   drop column if exists oral_audio_url, drop column if exists oral_audio_duration_seconds,
--   drop column if exists oral_examiner_id, drop column if exists oral_evaluated_at,
--   drop column if exists oral_created_at, drop column if exists oral_updated_at;
