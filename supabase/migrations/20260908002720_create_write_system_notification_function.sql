-- Migration: fonction write_system_notification — notifications système
-- Les clients ne peuvent pas écrire chez autrui ; seuls les rôles
-- d'administration le peuvent.
-- (scission de 20260908002700_enrolment_functions.sql, 1 objet = 1 fichier.)

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
