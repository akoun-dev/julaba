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

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid, text[]) to authenticated;

create policy organizations_member_read
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy zones_member_read
on public.zones for select to authenticated
using (public.is_org_member(organization_id));

alter table public.organization_members enable row level security;

create policy members_self_read
on public.organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_org_role(organization_id, array['super_admin','admin_general','admin_national'])
);
