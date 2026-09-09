create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_id uuid not null,
  -- Référence libre : aucun modèle de commande marketplace n'existe encore.
  order_reference text,
  sender_name text not null,
  sender_phone text not null,
  recipient_name text not null,
  recipient_phone text not null,
  address text not null,
  status text not null default 'en_attente',
  courier_name text,
  pickup_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index deliveries_zone_idx on public.deliveries(organization_id, zone_id, status);
create index deliveries_status_idx on public.deliveries(organization_id, status, created_at desc);

create trigger deliveries_updated_at
before update on public.deliveries
for each row execute function public.set_updated_at();

alter table public.deliveries enable row level security;

-- 'livraison' : super_admin, admin_general.
create policy deliveries_admin_read
on public.deliveries for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy deliveries_admin_insert
on public.deliveries for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy deliveries_admin_update
on public.deliveries for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));
