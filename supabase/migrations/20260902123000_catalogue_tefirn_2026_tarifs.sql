-- ============================================================================
-- Catalogue TEF IRN 2026 — alignement des tarifs sur l'offre EDOF publiée
-- Date : 02/09/2026
--
-- Contexte : le catalogue a été revu avec la CCI Paris Île-de-France
-- (validation Mme Mamert, 26/08/2026) et publié sur EDOF le 02/09/2026
-- (fichier 91342308300017_MYSTORY_catalogue_EDOF_TEFIRN2026.xml).
--
-- Barème : 150 € (examen TEF IRN inclus) + heures × taux dégressif
--          40 €/h de 1 à 15 h · 35 €/h de 16 à 30 h · 25 €/h au-delà de 30 h.
-- Plafond : 1 650 € = 1 500 € CPF + 150 € de ticket modérateur.
--
-- ⚠️ À N'APPLIQUER QUE SI /catalogue affiche encore les anciens prix (v6).
--    La table offres_formules servait de brouillon avant validation du
--    certificateur : elle contient peut-être déjà les bons montants.
--
-- Sûreté : snapshot complet AVANT modification → restaurable depuis
--          /catalogue > historique. Aucune ligne créée ni supprimée.
-- ============================================================================

-- 1) Point de retour arrière
insert into offres_formules_versions (auteur, motif, snapshot)
select 'migration 20260902', 'Avant alignement tarifs catalogue TEF IRN 2026',
       coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
from (select * from offres_formules order by offre_id, ordre) t;

-- 2) Alignement des prix, par durée (les durées sont uniques dans le catalogue)
update offres_formules set prix_eur = 750,  maj_le = now() where heures = 15 and prix_eur is distinct from 750;
update offres_formules set prix_eur = 1170, maj_le = now() where heures = 27 and prix_eur is distinct from 1170;
update offres_formules set prix_eur = 1500, maj_le = now() where heures = 39 and prix_eur is distinct from 1500;
update offres_formules set prix_eur = 960,  maj_le = now() where heures = 21 and prix_eur is distinct from 960;
update offres_formules set prix_eur = 1350, maj_le = now() where heures = 33 and prix_eur is distinct from 1350;
update offres_formules set prix_eur = 1650, maj_le = now() where heures = 45 and prix_eur is distinct from 1650;
update offres_formules set prix_eur = 855,  maj_le = now() where heures = 18 and prix_eur is distinct from 855;
update offres_formules set prix_eur = 1275, maj_le = now() where heures = 30 and prix_eur is distinct from 1275;
update offres_formules set prix_eur = 1575, maj_le = now() where heures = 42 and prix_eur is distinct from 1575;
update offres_formules set prix_eur = 630,  maj_le = now() where heures = 12 and prix_eur is distinct from 630;
update offres_formules set prix_eur = 1065, maj_le = now() where heures = 24 and prix_eur is distinct from 1065;
update offres_formules set prix_eur = 1425, maj_le = now() where heures = 36 and prix_eur is distinct from 1425;

-- 3) Désactiver les durées qui n'existent plus au catalogue CPF 2026
--    (6 h et 9 h relèvent désormais des modules courts HORS CPF).
update offres_formules set actif = false, maj_le = now()
where heures in (6, 9) and actif is true;

-- 4) Contrôle : signale toute formule active hors grille 2026
do $$
declare n int;
begin
  select count(*) into n from offres_formules
   where actif is true and heures not in (12,15,18,21,24,27,30,33,36,39,42,45);
  if n > 0 then
    raise notice 'ATTENTION : % formule(s) active(s) avec une duree hors grille 2026.', n;
  end if;

  select count(*) into n from offres_formules
   where actif is true and prix_eur > 1650;
  if n > 0 then
    raise notice 'ATTENTION : % formule(s) active(s) au-dessus du plafond de 1650 EUR.', n;
  end if;
end $$;
