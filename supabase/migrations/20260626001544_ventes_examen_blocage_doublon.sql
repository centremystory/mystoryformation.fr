-- 20260626001544 — ventes_examen_blocage_doublon
-- Blocage du doublon a la saisie des ventes d'examen (couche base / defense-in-depth).
-- NOTE : cette premiere version (portee large : toute inscription en attente, toutes
-- sessions confondues) est SUPERSEDEE par la migration 20260626094513
-- (ventes_examen_doublon_align_session), qui aligne la regle sur lib/examenCarence.checkDoublonExamen
-- (meme session uniquement). Conservee ici pour fidelite de l'historique.

create or replace function public.mystory_ventes_doublon()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doublon boolean;
begin
  if new.type_examen = 'Vente_plateforme' then
    return new;
  end if;
  if new.statut_paiement in ('Remboursé','Annulé') then
    return new;
  end if;

  select exists (
    select 1
    from public.ventes_examen v
    left join public.sessions_examen s on s.id = v.session_id
    where v.candidat_id = new.candidat_id
      and v.id is distinct from new.id
      and v.type_examen = new.type_examen
      and (new.type_examen <> 'Examen_civique'
           or coalesce(v.sous_type,'') = coalesce(new.sous_type,''))
      and v.statut_paiement not in ('Remboursé','Annulé')
      and not exists (select 1 from public.resultats_examen r where r.vente_id = v.id)
      and (s.date_examen is null
           or s.date_examen >= (now() at time zone 'Europe/Paris')::date)
  ) into v_doublon;

  if v_doublon then
    if new.doublon_force is not true then
      raise exception
        'Doublon examen : ce candidat a deja une inscription active (non passee) pour le meme examen%. Pour passer outre : cocher "forcer le doublon" + indiquer un motif.',
        case when new.type_examen = 'Examen_civique'
             then ' (mention '||coalesce(new.sous_type,'?')||')' else '' end
        using errcode = 'check_violation';
    elsif new.doublon_force_motif is null or btrim(new.doublon_force_motif) = '' then
      raise exception
        'Forcage du doublon : un motif est obligatoire (retard/absence, echec a reprogrammer, correction de saisie, cas particulier...).'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_ventes_doublon on public.ventes_examen;
create trigger trg_ventes_doublon
  before insert or update of candidat_id, type_examen, sous_type, session_id, statut_paiement
  on public.ventes_examen
  for each row execute function public.mystory_ventes_doublon();
