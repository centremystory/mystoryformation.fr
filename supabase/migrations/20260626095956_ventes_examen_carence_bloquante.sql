-- 20260626095956 — ventes_examen_carence_bloquante
-- Carence examen : de "signalee cote app" a "bloquante en base" (defense-in-depth).
-- Miroir EXACT de lib/examenCarence.checkInscriptionExamen + lib/inscriptions/regles.joursOuvresEntre.
--   TEF_IRN  : 20 jours calendaires depuis le dernier passage (nos ventes + declaratif externe du new).
--   Civique  : >= 1 jour ouvre entre deux passages (48 h ouvrees) + interdit 2 mentions differentes le meme jour.
--   Plateforme / sans session : aucune carence.
-- "Passage" = vente du candidat hors Annule/Rembourse avec date d'examen < session visee.
-- Forcage : carence_forcee = true + carence_forcee_motif non vide (Direction-only impose cote route).

-- 1) Paques (computus de Gauss) — identique a regles.paques()
create or replace function public.mystory_paques(annee int)
returns date language plpgsql immutable set search_path to 'public' as $function$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mois int; jour int;
begin
  a := annee % 19; b := annee / 100; c := annee % 100;
  d := b / 4; e := b % 4; f := (b + 8) / 25;
  g := (b - f + 1) / 3; h := (19*a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2*e + 2*i - h - k) % 7;
  m := (a + 11*h + 22*l) / 451;
  mois := (h + l - 7*m + 114) / 31;
  jour := ((h + l - 7*m + 114) % 31) + 1;
  return make_date(annee, mois, jour);
end $function$;

-- 2) Jour ouvre = lundi->vendredi hors feries France metropolitaine — identique a regles.estJourOuvre()
create or replace function public.mystory_est_jour_ouvre(d date)
returns boolean language plpgsql immutable set search_path to 'public' as $function$
declare y int := extract(year from d)::int; p date;
begin
  if extract(dow from d) in (0,6) then return false; end if;
  p := public.mystory_paques(y);
  return d <> all (array[
    make_date(y,1,1), make_date(y,5,1), make_date(y,5,8), make_date(y,7,14),
    make_date(y,8,15), make_date(y,11,1), make_date(y,11,11), make_date(y,12,25),
    p + 1, p + 39, p + 50
  ]::date[]);
end $function$;

-- 3) Nb de jours ouvres strictement entre deux dates (bornes exclues) — identique a regles.joursOuvresEntre()
create or replace function public.mystory_jours_ouvres_entre(debut date, fin date)
returns int language plpgsql immutable set search_path to 'public' as $function$
declare n int := 0; cur date := debut + 1;
begin
  while cur < fin loop
    if public.mystory_est_jour_ouvre(cur) then n := n + 1; end if;
    cur := cur + 1;
  end loop;
  return n;
end $function$;

-- 4) Trigger carence
create or replace function public.mystory_ventes_carence()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cible date;
  v_dernier date;
  v_viol boolean := false;
  v_msg text;
begin
  if new.type_examen = 'Vente_plateforme' or new.session_id is null then return new; end if;
  if new.statut_paiement in ('Remboursé','Annulé') then return new; end if;

  select date_examen into v_cible from public.sessions_examen where id = new.session_id;
  if v_cible is null then return new; end if;

  if new.type_examen = 'TEF_IRN' then
    select max(d) into v_dernier from (
      select s.date_examen as d
      from public.ventes_examen v
      join public.sessions_examen s on s.id = v.session_id
      where v.candidat_id = new.candidat_id
        and v.id is distinct from new.id
        and v.type_examen = 'TEF_IRN'
        and v.statut_paiement not in ('Remboursé','Annulé')
        and s.date_examen < v_cible
      union all
      select new.tef_passage_externe_date
      where new.tef_passage_externe_declare = true
        and new.tef_passage_externe_date is not null
        and new.tef_passage_externe_date < v_cible
    ) t;
    if v_dernier is not null and (v_cible - v_dernier) < 20 then
      v_viol := true;
      v_msg := 'Carence TEF IRN non respectee : dernier passage le '||to_char(v_dernier,'DD/MM/YYYY')||
               ' (20 jours requis entre deux TEF IRN). Re-eligible a partir du '||to_char(v_dernier + 20,'DD/MM/YYYY')||'.';
    end if;

  elsif new.type_examen = 'Examen_civique' then
    select max(s.date_examen) into v_dernier
    from public.ventes_examen v
    join public.sessions_examen s on s.id = v.session_id
    where v.candidat_id = new.candidat_id
      and v.id is distinct from new.id
      and v.type_examen = 'Examen_civique'
      and v.statut_paiement not in ('Remboursé','Annulé')
      and s.date_examen < v_cible;
    if v_dernier is not null and public.mystory_jours_ouvres_entre(v_dernier, v_cible) < 1 then
      v_viol := true;
      v_msg := 'Carence examen civique non respectee : dernier passage le '||to_char(v_dernier,'DD/MM/YYYY')||
               ' (48 h ouvrees minimum entre deux examens civiques). Choisir une session ulterieure.';
    end if;
    if not v_viol and exists (
      select 1
      from public.ventes_examen v
      join public.sessions_examen s on s.id = v.session_id
      where v.candidat_id = new.candidat_id
        and v.id is distinct from new.id
        and v.type_examen = 'Examen_civique'
        and v.statut_paiement not in ('Remboursé','Annulé')
        and s.date_examen = v_cible
        and coalesce(v.sous_type,'') <> coalesce(new.sous_type,'')
    ) then
      v_viol := true;
      v_msg := 'Une seule mention civique par jour : ce candidat a deja un examen civique d''une autre mention le '||to_char(v_cible,'DD/MM/YYYY')||'.';
    end if;
  end if;

  if v_viol then
    if new.carence_forcee is not true then
      raise exception '%', v_msg || ' Forcage Direction + motif requis.' using errcode = 'check_violation';
    elsif new.carence_forcee_motif is null or btrim(new.carence_forcee_motif) = '' then
      raise exception 'Forcage de la carence : un motif est obligatoire.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $function$;

drop trigger if exists trg_ventes_carence on public.ventes_examen;
create trigger trg_ventes_carence
  before insert or update of candidat_id, type_examen, sous_type, session_id, statut_paiement,
                              tef_passage_externe_declare, tef_passage_externe_date
  on public.ventes_examen
  for each row execute function public.mystory_ventes_carence();
