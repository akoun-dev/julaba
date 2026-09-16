-- Migration: fonction submit_enrolment — soumission d'un dossier d'enrôlement
-- Idempotent par (organization_id, dossier_id) : un rejeu réseau retourne le
-- dossier existant sans le modifier. Le nom de l'identificateur est dérivé du
-- profil serveur, jamais fourni par le client.
-- (scission de 20260908002700_enrolment_functions.sql, 1 objet = 1 fichier.)

-- Soumission d'un dossier d'enrôlement par l'identificateur lui-même.
-- Idempotent par (organization_id, dossier_id) : un rejeu réseau retourne le
-- dossier existant sans le modifier. Le nom de l'identificateur est dérivé du
-- profil serveur, jamais fourni par le client.
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
  p_gps_lng double precision default null
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

  select coalesce(
    nullif(trim(p.first_name || ' ' || coalesce(p.last_name, '')), ''),
    nullif(p.phone, ''),
    'Identificateur'
  ) into v_ident_name
  from public.profiles p where p.id = (select auth.uid());

  insert into public.enrolments (
    organization_id, zone_id, dossier_id, actor_name, actor_type, phone,
    has_photo, has_gps, gps_lat, gps_lng,
    identificateur_user_id, identificateur_name
  )
  values (
    p_organization_id, p_zone_id, trim(p_dossier_id), trim(p_actor_name), p_actor_type, trim(p_phone),
    p_has_photo, p_has_gps, p_gps_lat, p_gps_lng,
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

revoke all on function public.submit_enrolment(uuid, text, text, text, uuid, text, boolean, boolean, double precision, double precision) from public;
grant execute on function public.submit_enrolment(uuid, text, text, text, uuid, text, boolean, boolean, double precision, double precision) to authenticated;
