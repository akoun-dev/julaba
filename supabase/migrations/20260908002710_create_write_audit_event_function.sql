-- Migration: fonction write_audit_event — journal d'audit append-only
-- Les clients n'ont aucune policy insert/update sur audit_events, seules les
-- fonctions de confiance écrivent.
-- (scission de 20260908002700_enrolment_functions.sql, 1 objet = 1 fichier.)

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
