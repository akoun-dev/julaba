-- Migration: table legacy_bo_cron_jobs (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_cron_jobs (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  schedule        text not null,
  command         text,
  status          text not null default 'actif',
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  duration_ms     integer,
  run_count       integer not null default 0,
  avg_duration_ms integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_legacy_bo_cron_jobs_status on public.legacy_bo_cron_jobs(status);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_cron_jobs disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_cron_jobs_updated_at on public.legacy_bo_cron_jobs;
create trigger set_legacy_bo_cron_jobs_updated_at
  before update on public.legacy_bo_cron_jobs
  for each row execute function public.set_updated_at_legacy();
