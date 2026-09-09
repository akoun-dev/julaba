create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  merchant_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  name text not null check (length(trim(name)) between 1 and 160),
  category text not null default 'autre',
  price_unit bigint not null default 0 check (price_unit >= 0),
  stock_qty numeric(14, 3) not null default 0 check (stock_qty >= 0),
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create index products_scope_idx
on public.products(organization_id, merchant_user_id, updated_at desc);

create trigger products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy products_read_scope
on public.products for select to authenticated
using (public.is_org_member(organization_id) and (
  merchant_user_id = (select auth.uid()) or
  public.has_org_role(organization_id, array['super_admin','admin_general','admin_national','gestionnaire_zone'])
));

create policy products_insert_owner
on public.products for insert to authenticated
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy products_update_owner
on public.products for update to authenticated
using (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (merchant_user_id = (select auth.uid()) and public.is_org_member(organization_id));
