create table public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  schedule text not null,
  command text,
  status text not null default 'actif'
    check (status in ('actif', 'suspendu', 'desactive')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  run_count integer not null default 0 check (run_count >= 0),
  avg_duration_ms integer check (avg_duration_ms is null or avg_duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index cron_status_idx on public.cron_jobs(organization_id, status);

create trigger cron_jobs_updated_at
before update on public.cron_jobs
for each row execute function public.set_updated_at();

alter table public.cron_jobs enable row level security;

-- 'cron' : super_admin uniquement.
create policy cron_super_read
on public.cron_jobs for select to authenticated
using (public.has_org_role(organization_id, array['super_admin']));

create policy cron_super_write
on public.cron_jobs for insert to authenticated
with check (public.has_org_role(organization_id, array['super_admin']));

create policy cron_super_update
on public.cron_jobs for update to authenticated
using (public.has_org_role(organization_id, array['super_admin']))
with check (public.has_org_role(organization_id, array['super_admin']));
