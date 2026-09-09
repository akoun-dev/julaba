-- Codes d'acteur lisibles (#M-1001, #P-1002...) attribués sans course critique.
create sequence public.actor_code_seq start 1000;

-- Journal d'audit append-only : les clients n'ont aucune policy insert/update
-- sur audit_events, seules les fonctions de confiance écrivent.
create or replace function public.write_audit_event(
  p_organization_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_metadata jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  insert into public.audit_events (organization_id, actor_id, action, resource_type, resource_id, metadata)
  values (p_organization_id, (select auth.uid()), p_action, p_resource_type, p_resource_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.write_audit_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.write_audit_event(uuid, text, text, text, jsonb) to authenticated;

-- Notifications système (décisions de dossier, etc.) : les clients ne peuvent
-- pas écrire chez autrui ; seuls les rôles d'administration le peuvent.
create or replace function public.write_system_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_org_role(p_organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']) then
    raise exception using errcode = '42501', message = 'Notifications système réservées aux administrateurs';
  end if;
  insert into public.notifications (organization_id, user_id, type, title, body, data)
  values (p_organization_id, p_user_id, p_type, p_title, p_body, p_data);
end;
$$;

revoke all on function public.write_system_notification(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.write_system_notification(uuid, uuid, text, text, text, jsonb) to authenticated;

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

-- Décision backoffice sur un dossier : validation (avec création/mise à jour
-- transactionnelle de l'acteur) ou rejet motivé. Un gestionnaire de zone ne
-- peut décider que dans sa zone ; les admins nationaux partout.
create or replace function public.validate_enrolment(
  p_enrolment_id uuid,
  p_reject_reason text default null
)
returns public.enrolments
language plpgsql security invoker set search_path = public as $$
declare
  enrolment_row public.enrolments;
  actor_row public.actors;
  v_prefix text;
begin
  select * into enrolment_row from public.enrolments
  where id = p_enrolment_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Dossier introuvable';
  end if;

  if not (
    public.has_org_role(enrolment_row.organization_id, array['super_admin', 'admin_general', 'admin_national'])
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = enrolment_row.organization_id
        and m.user_id = (select auth.uid())
        and m.is_active
        and m.role = 'gestionnaire_zone'
        and m.zone_id = enrolment_row.zone_id
    )
  ) then
    raise exception using errcode = '42501', message = 'Dossier hors de votre périmètre';
  end if;

  if p_reject_reason is not null then
    if nullif(trim(p_reject_reason), '') is null then
      raise exception using errcode = '22023', message = 'La raison du rejet est obligatoire';
    end if;
    if enrolment_row.status = 'rejete' then
      return enrolment_row; -- rejeu idempotent
    end if;
    update public.enrolments
    set status = 'rejete', reject_reason = p_reject_reason,
        validated_by_user_id = (select auth.uid()), validated_at = now()
    where id = p_enrolment_id
    returning * into enrolment_row;

    if enrolment_row.identificateur_user_id is not null then
      perform public.write_system_notification(
        enrolment_row.organization_id, enrolment_row.identificateur_user_id, 'dossier_rejete',
        'Dossier rejeté',
        'Le dossier de ' || enrolment_row.actor_name || ' a été rejeté : ' || p_reject_reason,
        jsonb_build_object('dossier_id', enrolment_row.dossier_id)
      );
    end if;
    perform public.write_audit_event(enrolment_row.organization_id, 'enrolment_reject',
      'enrolments', enrolment_row.id::text,
      jsonb_build_object('dossier_id', enrolment_row.dossier_id));
    return enrolment_row;
  end if;

  if enrolment_row.status = 'valide' then
    return enrolment_row; -- rejeu idempotent
  end if;

  update public.enrolments
  set status = 'valide', validated_by_user_id = (select auth.uid()), validated_at = now()
  where id = p_enrolment_id
  returning * into enrolment_row;

  -- Acteur créé ou rafraîchi dans la même transaction : un même
  -- (téléphone, type) reste un seul acteur.
  select * into actor_row from public.actors
  where organization_id = enrolment_row.organization_id
    and phone = enrolment_row.phone
    and actor_type = enrolment_row.actor_type
  for update;

  if found then
    update public.actors
    set first_name = enrolment_row.actor_name,
        zone_id = enrolment_row.zone_id,
        status = 'actif',
        identificateur_user_id = enrolment_row.identificateur_user_id,
        identificateur_name = enrolment_row.identificateur_name,
        validated_by_user_id = (select auth.uid()),
        validated_at = now(),
        gps_lat = coalesce(enrolment_row.gps_lat, actors.gps_lat),
        gps_lng = coalesce(enrolment_row.gps_lng, actors.gps_lng)
    where id = actor_row.id;
  else
    v_prefix := case enrolment_row.actor_type when 'producteur' then 'P' else 'M' end;
    insert into public.actors (
      organization_id, zone_id, actor_code, first_name, actor_type, phone, status,
      photo_path, gps_lat, gps_lng,
      identificateur_user_id, identificateur_name,
      validated_by_user_id, validated_at, notes
    )
    values (
      enrolment_row.organization_id, enrolment_row.zone_id,
      '#' || v_prefix || '-' || lpad(nextval('public.actor_code_seq')::text, 4, '0'),
      enrolment_row.actor_name, enrolment_row.actor_type, enrolment_row.phone, 'actif',
      null, enrolment_row.gps_lat, enrolment_row.gps_lng,
      enrolment_row.identificateur_user_id, enrolment_row.identificateur_name,
      (select auth.uid()), now(),
      'Créé depuis le dossier ' || enrolment_row.dossier_id
    );
  end if;

  if enrolment_row.identificateur_user_id is not null then
    perform public.write_system_notification(
      enrolment_row.organization_id, enrolment_row.identificateur_user_id, 'dossier_valide',
      'Dossier validé',
      'Le dossier de ' || enrolment_row.actor_name || ' a été validé.',
      jsonb_build_object('dossier_id', enrolment_row.dossier_id)
    );
  end if;
  perform public.write_audit_event(enrolment_row.organization_id, 'enrolment_validate',
    'enrolments', enrolment_row.id::text,
    jsonb_build_object('dossier_id', enrolment_row.dossier_id, 'actor_name', enrolment_row.actor_name));

  return enrolment_row;
end;
$$;

revoke all on function public.validate_enrolment(uuid, text) from public;
grant execute on function public.validate_enrolment(uuid, text) to authenticated;
