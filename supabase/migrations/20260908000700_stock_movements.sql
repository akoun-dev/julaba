create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  movement_type text not null check (movement_type in ('entree', 'vente', 'correction', 'synchronisation')),
  quantity numeric(14, 3) not null check (quantity <> 0),
  reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

alter table public.stock_movements enable row level security;

create policy stock_read_scope
on public.stock_movements for select to authenticated
using (public.is_org_member(organization_id));

create policy stock_insert_owner
on public.stock_movements for insert to authenticated
with check (user_id = (select auth.uid()) and public.is_org_member(organization_id));
