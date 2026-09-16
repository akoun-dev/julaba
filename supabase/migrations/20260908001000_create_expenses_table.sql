create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  amount bigint not null check (amount >= 0),
  category text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

alter table public.expenses enable row level security;

create policy expenses_owner_scope
on public.expenses for all to authenticated
using (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));
