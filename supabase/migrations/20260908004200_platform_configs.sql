create table public.platform_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  -- Le JSON libre de Prisma devient jsonb typé et requêtable.
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category)
);

create trigger platform_configs_updated_at
before update on public.platform_configs
for each row execute function public.set_updated_at();

alter table public.platform_configs enable row level security;

-- 'config-institution' : super_admin uniquement.
create policy platform_configs_super_read
on public.platform_configs for select to authenticated
using (public.has_org_role(organization_id, array['super_admin']));

create policy platform_configs_super_write
on public.platform_configs for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin']));

create policy platform_configs_super_update
on public.platform_configs for update to authenticated
using (public.has_org_role(organization_id, array['super_admin']))
with check (public.has_org_role(organization_id, array['super_admin']));
