create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  total_amount bigint not null check (total_amount >= 0),
  amount_received bigint not null default 0 check (amount_received >= 0),
  change_amount bigint not null default 0 check (change_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create index sales_scope_idx
on public.sales(organization_id, merchant_user_id, created_at desc);

alter table public.sales enable row level security;

create policy sales_read_scope
on public.sales for select to authenticated
using (public.is_org_member(organization_id));

create policy sales_insert_owner
on public.sales for insert to authenticated
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy sales_update_owner
on public.sales for update to authenticated
using (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));
