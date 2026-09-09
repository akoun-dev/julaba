create table public.producer_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  producer_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  reference text not null,
  buyer_name text not null,
  product_name text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  amount bigint not null check (amount >= 0),
  desired_delivery_date timestamptz not null,
  status text not null default 'a_traiter'
    check (status in ('a_traiter', 'en_cours', 'livree', 'refusee')),
  is_urgent boolean not null default false,
  carrier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id),
  unique (organization_id, reference)
);

create index producer_orders_scope_idx
on public.producer_orders(organization_id, producer_user_id, created_at desc);

create index producer_orders_status_idx
on public.producer_orders(organization_id, status);

create trigger producer_orders_updated_at
before update on public.producer_orders
for each row execute function public.set_updated_at();

alter table public.producer_orders enable row level security;

create policy producer_orders_read_scope
on public.producer_orders for select to authenticated
using (public.is_org_member(organization_id));

create policy producer_orders_insert_owner
on public.producer_orders for insert to authenticated
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy producer_orders_update_owner
on public.producer_orders for update to authenticated
using (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));
