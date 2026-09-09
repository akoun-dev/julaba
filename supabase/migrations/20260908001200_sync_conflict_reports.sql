create table public.sync_conflict_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  client_id uuid,
  payload jsonb not null default '{}'::jsonb,
  message text not null,
  client_created_at timestamptz,
  reported_at timestamptz not null default now()
);

alter table public.sync_conflict_reports enable row level security;

create policy conflicts_owner_insert
on public.sync_conflict_reports for insert to authenticated
with check (user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy conflicts_owner_read
on public.sync_conflict_reports for select to authenticated
using (user_id = (select auth.uid()) or public.has_org_role(organization_id, array['super_admin','admin_general']));
