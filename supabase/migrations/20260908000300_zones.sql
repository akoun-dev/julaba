create table public.zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create index zones_org_idx on public.zones(organization_id, is_active);

alter table public.zones enable row level security;
