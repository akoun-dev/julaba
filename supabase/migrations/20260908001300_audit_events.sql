create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

create policy audit_admin_read
on public.audit_events for select to authenticated
using (organization_id is null or public.has_org_role(organization_id, array['super_admin','admin_general','admin_national']));
