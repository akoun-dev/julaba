-- Migration: fonction validate_enrolment — la catégorie du dossier coule vers l'acteur
-- Extrait de 20260916210000_marchand_categories.sql (re-baseline 1 objet = 1 fichier).
--
-- Même signature : CREATE OR REPLACE suffit. À la validation, l'acteur est
-- créé ou rafraîchi dans la même transaction ; un même (téléphone, type)
-- reste un seul acteur. coalesce permet une mise à jour sans jamais effacer
-- une valeur déjà connue par un dossier antérieur.

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
        gps_lng = coalesce(enrolment_row.gps_lng, actors.gps_lng),
        categorie_marchand = coalesce(enrolment_row.categorie_marchand, actors.categorie_marchand)
    where id = actor_row.id;
  else
    v_prefix := case enrolment_row.actor_type when 'producteur' then 'P' else 'M' end;
    insert into public.actors (
      organization_id, zone_id, actor_code, first_name, actor_type, phone, status,
      photo_path, gps_lat, gps_lng,
      categorie_marchand,
      identificateur_user_id, identificateur_name,
      validated_by_user_id, validated_at, notes
    )
    values (
      enrolment_row.organization_id, enrolment_row.zone_id,
      '#' || v_prefix || '-' || lpad(nextval('public.actor_code_seq')::text, 4, '0'),
      enrolment_row.actor_name, enrolment_row.actor_type, enrolment_row.phone, 'actif',
      null, enrolment_row.gps_lat, enrolment_row.gps_lng,
      enrolment_row.categorie_marchand,
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
