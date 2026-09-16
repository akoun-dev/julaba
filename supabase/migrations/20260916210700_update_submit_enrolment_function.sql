-- Migration: fonction submit_enrolment — accepter et propager la catégorie
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- Nouveaux paramètres facultatifs en FIN de signature (p_categorie_marchand,
-- p_activite) : les appelants existants (route /api/v1) restent valides tels
-- quels. Le drop préalable de l'ancienne signature évite la surcharge ambiguë.

drop function if exists public.submit_enrolment(
  uuid, text, text, text, uuid, text, boolean, boolean, double precision, double precision
);

create or replace function public.submit_enrolment(
  p_organization_id uuid,
  p_dossier_id text,
  p_actor_name text,
  p_actor_type text,
  p_zone_id uuid,
  p_phone text,
  p_has_photo boolean default false,
  p_has_gps boolean default false,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_categorie_marchand text default null,
  p_activite text default null
)
returns public.enrolments
language plpgsql security invoker set search_path = public as $$
declare
  enrolment_row public.enrolments;
  v_ident_name text;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  if nullif(trim(p_dossier_id), '') is null or nullif(trim(p_actor_name), '') is null
    or nullif(trim(p_phone), '') is null then
    raise exception using errcode = '22023', message = 'Dossier, acteur et téléphone sont obligatoires';
  end if;
  if not exists (
    select 1 from public.zones
    where id = p_zone_id and organization_id = p_organization_id
  ) then
    raise exception using errcode = '22023', message = 'Zone inconnue dans cette organisation';
  end if;
  -- La catégorie ne concerne que les marchands ; si fournie pour un autre
  -- type d'acteur, elle est ignorée proprement plutôt que rejetée.
  if p_actor_type = 'marchand'
     and p_categorie_marchand is not null
     and p_categorie_marchand not in ('detaillant', 'semi_grossiste', 'grossiste') then
    raise exception using errcode = '22023', message = 'Catégorie de marchand inconnue';
  end if;

  select coalesce(
    nullif(trim(p.first_name || ' ' || coalesce(p.last_name, '')), ''),
    nullif(p.phone, ''),
    'Identificateur'
  ) into v_ident_name
  from public.profiles p where p.id = (select auth.uid());

  insert into public.enrolments (
    organization_id, zone_id, dossier_id, actor_name, actor_type, phone,
    has_photo, has_gps, gps_lat, gps_lng,
    categorie_marchand, activite,
    identificateur_user_id, identificateur_name
  )
  values (
    p_organization_id, p_zone_id, trim(p_dossier_id), trim(p_actor_name), p_actor_type, trim(p_phone),
    p_has_photo, p_has_gps, p_gps_lat, p_gps_lng,
    case when p_actor_type = 'marchand' then p_categorie_marchand end,
    p_activite,
    auth.uid(), v_ident_name
  )
  on conflict (organization_id, dossier_id) do nothing
  returning * into enrolment_row;

  if enrolment_row.id is null then
    select * into enrolment_row from public.enrolments
    where organization_id = p_organization_id and dossier_id = trim(p_dossier_id);
  end if;
  return enrolment_row;
end;
$$;

revoke all on function public.submit_enrolment(uuid, text, text, text, uuid, text, boolean, boolean, double precision, double precision, text, text) from public;
grant execute on function public.submit_enrolment(uuid, text, text, text, uuid, text, boolean, boolean, double precision, double precision, text, text) to authenticated;
