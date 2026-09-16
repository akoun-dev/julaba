-- Transferts d'acteurs entre zones (BoMutation dans le schéma Prisma).
create table public.mutations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references public.actors(id) on delete restrict,
  from_zone_id uuid not null,
  to_zone_id uuid not null,
  reason text,
  status text not null default 'en_attente'
    check (status in ('en_attente', 'approuvee', 'refusee')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_by_user_id uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mutation_zones_distinct check (from_zone_id <> to_zone_id),
  constraint mutation_from_zone_same_org foreign key (organization_id, from_zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred,
  constraint mutation_to_zone_same_org foreign key (organization_id, to_zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred
);

create index mutations_actor_idx on public.mutations(organization_id, actor_id, requested_at desc);
create index mutations_status_idx on public.mutations(organization_id, status);

create trigger mutations_updated_at
before update on public.mutations
for each row execute function public.set_updated_at();

alter table public.mutations enable row level security;

create policy mutations_read_scope
on public.mutations for select to authenticated
using (public.is_org_member(organization_id));

create policy mutations_admin_insert
on public.mutations for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy mutations_admin_update
on public.mutations for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
