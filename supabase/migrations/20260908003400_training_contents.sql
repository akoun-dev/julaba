create table public.training_contents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  type text not null,
  category text,
  content text not null,
  excerpt text,
  author text,
  status text not null default 'publie'
    check (status in ('brouillon', 'publie', 'archive')),
  difficulty text default 'debutant'
    check (difficulty is null or difficulty in ('debutant', 'intermediaire', 'avance')),
  duration text,
  target_role text,
  media_url text,
  sort_order integer not null default 0,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_status_idx on public.training_contents(organization_id, status, sort_order, created_at desc);
create index training_type_idx on public.training_contents(organization_id, type, status);

create trigger training_contents_updated_at
before update on public.training_contents
for each row execute function public.set_updated_at();

alter table public.training_contents enable row level security;

-- L'académie est lisible par tous les membres (contenus de formation),
-- pilotée par les administrateurs ('contenus' : super_admin, admin_general).
create policy training_read_scope
on public.training_contents for select to authenticated
using (public.is_org_member(organization_id));

create policy training_admin_insert
on public.training_contents for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy training_admin_update
on public.training_contents for update to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']))
with check (public.has_org_role(organization_id, array['super_admin', 'admin_general']));

create policy training_admin_delete
on public.training_contents for delete to authenticated
using (public.has_org_role(organization_id, array['super_admin', 'admin_general']));
