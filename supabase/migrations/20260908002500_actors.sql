create table public.actors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  zone_id uuid not null,
  actor_code text not null,
  first_name text not null,
  last_name text,
  actor_type text not null default 'marchand'
    check (actor_type in ('marchand', 'producteur', 'cooperatif')),
  phone text not null,
  status text not null default 'en_attente'
    check (status in ('actif', 'suspendu', 'en_attente', 'rejete')),
  photo_path text,
  gps_lat double precision,
  gps_lng double precision,
  identificateur_user_id uuid references auth.users(id) on delete set null,
  identificateur_name text,
  validated_by_user_id uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  linked_merchant_user_id uuid references auth.users(id) on delete set null,
  linked_producer_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, actor_code),
  unique (linked_merchant_user_id),
  unique (linked_producer_user_id),
  -- La zone doit appartenir à la même organisation que l'acteur.
  constraint actor_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index actors_zone_idx on public.actors(organization_id, zone_id);
create index actors_status_idx on public.actors(organization_id, status);
create index actors_type_idx on public.actors(organization_id, actor_type);
create index actors_phone_idx on public.actors(organization_id, phone, actor_type);

create trigger actors_updated_at
before update on public.actors
for each row execute function public.set_updated_at();

alter table public.actors enable row level security;

create policy actors_read_scope
on public.actors for select to authenticated
using (public.is_org_member(organization_id));

-- Les acteurs sont créés par la validation d'un dossier ou par le backoffice,
-- jamais par une inscription directe d'appareil.
create policy actors_admin_insert
on public.actors for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy actors_admin_update
on public.actors for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
