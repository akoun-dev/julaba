create table public.missions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  zone_id uuid not null,
  title text not null,
  description text,
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_name text,
  status text not null default 'en_cours'
    check (status in ('en_cours', 'terminee', 'suspendue')),
  target_count integer not null default 0 check (target_count >= 0),
  current_count integer not null default 0
    check (current_count >= 0 and current_count <= target_count),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_zone_same_org foreign key (organization_id, zone_id)
    references public.zones(organization_id, id)
    on delete restrict
    deferrable initially deferred,
  constraint mission_dates_consistent check (ends_on is null or ends_on >= starts_on)
);

create index missions_zone_idx on public.missions(organization_id, zone_id, status);
create index missions_assignee_idx on public.missions(assignee_user_id, status);

create trigger missions_updated_at
before update on public.missions
for each row execute function public.set_updated_at();

alter table public.missions enable row level security;

create policy missions_read_scope
on public.missions for select to authenticated
using (public.is_org_member(organization_id));

create policy missions_admin_insert
on public.missions for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy missions_admin_update
on public.missions for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
