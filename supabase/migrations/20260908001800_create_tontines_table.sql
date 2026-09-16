create table public.tontines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid,
  name text not null,
  amount bigint not null check (amount >= 0),
  frequency text not null default 'mensuel'
    check (frequency in ('hebdomadaire', 'mensuel', 'trimestriel', 'annuel')),
  member_count integer not null default 0 check (member_count >= 0),
  next_due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_id),
  unique (organization_id, id)
);

create index tontines_org_idx
on public.tontines(organization_id, created_at desc);

alter table public.tontines enable row level security;

create policy tontines_read_scope
on public.tontines for select to authenticated
using (public.is_org_member(organization_id));

-- Les tontines sont créées et pilotées par le backoffice, jamais par un
-- appareil marchand.
create policy tontines_admin_insert
on public.tontines for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy tontines_admin_update
on public.tontines for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
