-- Migration: table organization_members — appartenance organisation/rôle
-- (scission de 20260908000400_organization_members.sql, 1 objet = 1 fichier).

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'super_admin', 'admin_general', 'admin_national',
    'gestionnaire_zone', 'operateur_terrain', 'marchand',
    'producteur', 'identificateur'
  )),
  zone_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint member_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete set null
    deferrable initially deferred
);

create index organization_members_user_idx
on public.organization_members(user_id, is_active);
create index organization_members_scope_idx
on public.organization_members(organization_id, role, zone_id);
