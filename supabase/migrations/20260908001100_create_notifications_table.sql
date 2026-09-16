create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
on public.notifications(user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_owner_scope
on public.notifications for select to authenticated
using (user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy notifications_owner_update
on public.notifications for update to authenticated
using (user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (user_id = (select auth.uid()) and public.is_org_member(organization_id));
