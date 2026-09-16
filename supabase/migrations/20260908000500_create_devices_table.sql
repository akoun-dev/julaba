create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key_hash text not null unique,
  label text,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;

create policy devices_owner_read
on public.devices for select to authenticated
using (user_id = (select auth.uid()) and public.is_org_member(organization_id));
