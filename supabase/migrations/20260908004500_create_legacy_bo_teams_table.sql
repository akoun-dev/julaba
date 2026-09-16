-- Migration: table legacy_bo_teams — équipes d'agents de terrain (« équipes »)
-- (scission de 20260908004500_mission_teams_assignments.sql, 1 table = 1 fichier).

create table if not exists public.legacy_bo_teams (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  zone        text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_legacy_bo_teams_name on public.legacy_bo_teams(name);

alter table public.legacy_bo_teams disable row level security;

drop trigger if exists set_legacy_bo_teams_updated_at on public.legacy_bo_teams;
create trigger set_legacy_bo_teams_updated_at
before update on public.legacy_bo_teams
for each row execute function public.set_updated_at_legacy();
