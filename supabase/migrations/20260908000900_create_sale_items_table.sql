create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  subtotal bigint not null check (subtotal >= 0)
);

create index sale_items_sale_idx on public.sale_items(sale_id);

alter table public.sale_items enable row level security;

create policy sale_items_read_scope
on public.sale_items for select to authenticated
using (exists (
  select 1 from public.sales s
  where s.id = sale_id and public.is_org_member(s.organization_id)
));

create policy sale_items_insert_owner
on public.sale_items for insert to authenticated
with check (exists (
  select 1 from public.sales s
  where s.id = sale_id
    and s.merchant_user_id = (select auth.uid())
    and public.is_org_member(s.organization_id)
));
