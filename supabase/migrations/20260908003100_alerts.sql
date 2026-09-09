create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  severity text not null default 'moyenne'
    check (severity in ('faible', 'basse', 'moyenne', 'haute', 'critique')),
  title text not null,
  message text not null,
  module text not null,
  acknowledged boolean not null default false,
  acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index alerts_module_idx on public.alerts(organization_id, module, created_at desc);
create index alerts_ack_idx on public.alerts(organization_id, acknowledged, created_at desc);

alter table public.alerts enable row level security;

create policy alerts_admin_read
on public.alerts for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));

create policy alerts_admin_insert
on public.alerts for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national']));

create policy alerts_admin_update
on public.alerts for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general', 'admin_national', 'gestionnaire_zone']));
