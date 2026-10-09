-- 20261009235000_dossiers_lien_vente_formation.sql
--
-- POURQUOI — mesuré le 09/10/2026 : 158 ventes de formation en base, 4 dossiers
-- (dont 3 à 1 h et 0 €, donc des essais), 56 pièces toutes « manquant », 0 convention
-- signée. La chaîne Qualiopi du CRM est complète et correcte ; ce qui manquait, c'est
-- le chemin entre la vente et le dossier. Aucune route n'insérait dans `dossiers`
-- en dehors de l'import EDOF.
--
-- Cette colonne trace DE QUELLE vente vient un dossier. Deux raisons, aucune cosmétique :
--   1. L'IDEMPOTENCE. Sans ce lien, un double clic de la conseillère crée deux dossiers
--      et deux liasses de 14 pièces pour la même vente. Plus rien n'est recomptable, et
--      c'est exactement le genre de doublon qu'on a passé la journée du 06/10 à nettoyer.
--   2. LA PREUVE. Au contrôle, une ligne de chiffre d'affaires doit pouvoir être
--      rapprochée de la liasse qui la justifie. Le lien se fait ici, pas dans un onglet
--      tenu à la main.
--
-- Purement additive et idempotente : aucune donnée existante n'est touchée, aucun DROP.

alter table public.dossiers
  add column if not exists vente_formation_id uuid;

-- La contrainte est posée à part : `add constraint` n'accepte pas `if not exists`.
-- `on delete set null` plutôt que `cascade` : si une ligne de vente est supprimée,
-- le dossier et ses preuves doivent SURVIVRE. On perd la traçabilité, jamais la liasse.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dossiers'::regclass
      and conname = 'dossiers_vente_formation_id_fkey'
  ) then
    alter table public.dossiers
      add constraint dossiers_vente_formation_id_fkey
      foreign key (vente_formation_id)
      references public.ventes_formation (id)
      on update cascade on delete set null;
  end if;
end $$;

-- Une vente ne produit qu'UN dossier. C'est cet index qui rend le bouton rejouable
-- sans risque : le second appel est refusé par la base, pas seulement par la route.
-- Index partiel : les dossiers sans vente rattachée (imports EDOF, dossiers antérieurs)
-- restent tous permis.
create unique index if not exists dossiers_vente_formation_unique
  on public.dossiers (vente_formation_id)
  where vente_formation_id is not null;

comment on column public.dossiers.vente_formation_id is
  'Vente de formation (public.ventes_formation) dont ce dossier est issu. Posé par POST /api/dossiers/depuis-vente. NULL pour les dossiers créés avant le 09/10/2026 et pour les imports EDOF.';
