create table public.harvests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  producer_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid,
  product_name text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  quality text not null default 'standard'
    check (quality in ('premium', 'standard', 'secondaire')),
  harvested_at timestamptz not null,
  plot text not null,
  desired_price_per_kg bigint not null check (desired_price_per_kg >= 0),
  photo_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_paths) = 'array'),
  status text not null default 'brouillon'
    check (status in ('brouillon', 'publiee', 'vendue')),
  buyer text,
  sale_amount bigint check (sale_amount is null or sale_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id)
);

create index harvests_scope_idx
on public.harvests(organization_id, producer_user_id, created_at desc);

create index harvests_status_idx
on public.harvests(organization_id, status);

create trigger harvests_updated_at
before update on public.harvests
for each row execute function public.set_updated_at();

alter table public.harvests enable row level security;

create policy harvests_read_scope
on public.harvests for select to authenticated
using (public.is_org_member(organization_id));

create policy harvests_insert_owner
on public.harvests for insert to authenticated
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));

create policy harvests_update_owner
on public.harvests for update to authenticated
using (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id))
with check (producer_user_id = (select auth.uid()) and public.is_org_member(organization_id));
