create table public.keiwa_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  holder_name text not null,
  holder_phone text not null,
  zone_id uuid,
  balance bigint not null default 0,
  transaction_count integer not null default 0 check (transaction_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, holder_phone),
  unique (organization_id, id),
  constraint keiwa_account_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete set null
    deferrable initially deferred
);

create index keiwa_accounts_zone_idx on public.keiwa_accounts(organization_id, zone_id, is_active);

create trigger keiwa_accounts_updated_at
before update on public.keiwa_accounts
for each row execute function public.set_updated_at();

alter table public.keiwa_accounts enable row level security;

-- 'keiwa' : super_admin, admin_general. Écritures financières partenaires.
create policy keiwa_accounts_admin_read
on public.keiwa_accounts for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy keiwa_accounts_admin_insert
on public.keiwa_accounts for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy keiwa_accounts_admin_update
on public.keiwa_accounts for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));
