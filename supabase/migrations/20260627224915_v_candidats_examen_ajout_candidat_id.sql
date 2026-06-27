-- Ajoute candidat_id (id stagiaire) à la vue unifiée des candidats d'examen,
-- pour permettre le lien "nom du candidat → fiche client" depuis /examens/candidats.
-- Import → examens.stagiaire_id ; Vente → ventes_examen.candidat_id. Ajout en fin de SELECT.
create or replace view public.v_candidats_examen as
 with base as (
   select e.id, 'import'::text as source, e.nom, e.prenom, e.civilite, e.email, e.telephone,
     e.type_examen as type_brut,
     case
       when lower(replace(coalesce(e.type_examen,''::text),'_'::text,' '::text)) ~~ '%tef%'::text then 'TEF_IRN'::text
       when lower(replace(coalesce(e.type_examen,''::text),'_'::text,' '::text)) ~~ '%civi%'::text then 'CIVIQUE'::text
       when lower(replace(coalesce(e.type_examen,''::text),'_'::text,' '::text)) ~~ '%plate%'::text then 'PLATEFORME'::text
       else 'AUTRE'::text
     end as type_norm,
     e.sous_type, e.date_examen, e.horaire, e.agence_vente as agence, e.statut_paiement,
     e.num_attestation as numero_attestation, e.num_facture as numero_facture, e.vendu_par,
     e.montant_eur as montant, coalesce(e.a_confirmer,false) as a_confirmer, e.date_inscription,
     null::uuid as session_id, null::numeric as reste_a_payer,
     e.stagiaire_id as candidat_id
   from examens e
   where coalesce(e.actif,true)=true
   union all
   select v.id, 'vente'::text as source, s.nom, s.prenom, s.civilite, s.email, s.telephone,
     coalesce(v.type_examen, se.type) as type_brut,
     case
       when lower(replace(coalesce(coalesce(v.type_examen, se.type),''::text),'_'::text,' '::text)) ~~ '%tef%'::text then 'TEF_IRN'::text
       when lower(replace(coalesce(coalesce(v.type_examen, se.type),''::text),'_'::text,' '::text)) ~~ '%civi%'::text then 'CIVIQUE'::text
       when lower(replace(coalesce(coalesce(v.type_examen, se.type),''::text),'_'::text,' '::text)) ~~ '%plate%'::text then 'PLATEFORME'::text
       else 'AUTRE'::text
     end as type_norm,
     v.sous_type, se.date_examen, se.horaire, v.agence, v.statut_paiement,
     v.numero_attestation, v.numero_facture, v.vendu_par, v.montant,
     false as a_confirmer, v.date_inscription, v.session_id, v.reste_a_payer,
     v.candidat_id
   from ventes_examen v
     left join stagiaires s on s.id = v.candidat_id
     left join sessions_examen se on se.id = v.session_id
 )
 select b.id, b.source, b.nom, b.prenom, b.civilite, b.email, b.telephone, b.type_brut, b.type_norm,
   b.sous_type, b.date_examen, b.horaire, b.agence, b.statut_paiement, b.numero_attestation,
   b.numero_facture, b.vendu_par, b.montant, b.a_confirmer, b.date_inscription,
   a.fichier_nom as attestation_nom, a.depose_le as attestation_depose_le, b.session_id, b.reste_a_payer,
   b.candidat_id
 from base b
   left join lateral (
     select t.fichier_nom, t.depose_le from attestations_tef t
     where t.examen_ref = b.id and t.source = b.source and t.actif = true
     order by t.depose_le desc limit 1
   ) a on true;
