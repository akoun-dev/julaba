create table public.system_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  level text not null default 'INFO'
    check (level in ('INFO', 'WARN', 'ERROR', 'DEBUG')),
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index system_events_level_idx on public.system_events(organization_id, level, created_at desc);
create index system_events_created_idx on public.system_events(created_at desc);

alter table public.system_events enable row level security;

-- 'events' : super_admin uniquement en lecture ; écriture par la fonction de
-- confiance ci-dessous uniquement (aucune policy insert/update/delete client).
create policy system_events_super_read
on public.system_events for select to authenticated
using (public.has_org_role(organization_id, array['super_admin']));

-- Journalisation système append-only pour les jobs et workers serveur.
create or replace function public.write_system_event(
  p_organization_id uuid,
  p_level text,
  p_source text,
  p_message text,
  p_metadata jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'Organisation inaccessible';
  end if;
  if p_level not in ('INFO', 'WARN', 'ERROR', 'DEBUG') then
    raise exception using errcode = '22023', message = 'Niveau de log invalide';
  end if;
  insert into public.system_events (organization_id, level, source, message, metadata)
  values (p_organization_id, p_level, p_source, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.write_system_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.write_system_event(uuid, text, text, text, jsonb) to authenticated;
