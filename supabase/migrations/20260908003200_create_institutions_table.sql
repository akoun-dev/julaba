create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  linked_actors integer not null default 0 check (linked_actors >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index institutions_type_idx on public.institutions(organization_id, type, is_active);

create trigger institutions_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();

alter table public.institutions enable row level security;

create policy institutions_admin_read
on public.institutions for select to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy institutions_admin_insert
on public.institutions for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy institutions_admin_update
on public.institutions for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy institutions_admin_delete
on public.institutions for delete to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));
