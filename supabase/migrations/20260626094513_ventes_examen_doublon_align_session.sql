-- 20260626094513 — ventes_examen_doublon_align_session
-- Aligne le blocage doublon (trigger trg_ventes_doublon) sur la definition applicative
-- lib/examenCarence.checkDoublonExamen, afin qu'aucun insert autorise par l'app ne soit
-- rejete par la base (et inversement).
--
-- Doublon = meme candidat + MEME session_id + meme type (+ meme mention pour le civique),
--   statut actif (hors Remboursé/Annulé), EXCLUANT les reinscriptions (reinscription_de).
--   Vente_plateforme / sans session = jamais un doublon (renouvellement 1 mois / 3 mois legitime).
--   Mentions civiques differentes = autorisees.
-- Forcage : doublon_force = true + doublon_force_motif non vide (journalise cote route).
--
-- C'est la version EN VIGUEUR (supersede 20260626001544).

create or replace function public.mystory_ventes_doublon()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doublon boolean;
begin
  if new.type_examen = 'Vente_plateforme' or new.session_id is null then
    return new;
  end if;
  if new.statut_paiement in ('Remboursé','Annulé') then
    return new;
  end if;
  -- Reinscription = legitime, jamais un doublon.
  if new.reinscription_de is not null then
    return new;
  end if;

  select exists (
    select 1
    from public.ventes_examen v
    where v.candidat_id = new.candidat_id
      and v.session_id  = new.session_id
      and v.type_examen = new.type_examen
      and v.id is distinct from new.id
      and v.statut_paiement not in ('Remboursé','Annulé')
      and v.reinscription_de is null
      and (new.type_examen <> 'Examen_civique'
           or coalesce(v.sous_type,'') = coalesce(new.sous_type,''))
  ) into v_doublon;

  if v_doublon then
    if new.doublon_force is not true then
      raise exception
        'Doublon examen : ce candidat a deja une inscription active sur cette session pour le meme examen%. Cocher "forcer le doublon" + motif pour passer outre.',
        case when new.type_examen = 'Examen_civique'
             then ' (mention '||coalesce(new.sous_type,'?')||')' else '' end
        using errcode = 'check_violation';
    elsif new.doublon_force_motif is null or btrim(new.doublon_force_motif) = '' then
      raise exception 'Forcage du doublon : un motif est obligatoire.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_ventes_doublon on public.ventes_examen;
create trigger trg_ventes_doublon
  before insert or update of candidat_id, type_examen, sous_type, session_id, statut_paiement, reinscription_de
  on public.ventes_examen
  for each row execute function public.mystory_ventes_doublon();
