-- Migration: table legacy_bo_mission_assignees — assignations mission × agent
-- (many-to-many ; team_id sur legacy_bo_missions reste un raccourci enregistré
-- à côté).
-- (scission de 20260908004500_mission_teams_assignments.sql, 1 table = 1 fichier.)

create table if not exists public.legacy_bo_mission_assignees (
  mission_id        text not null references public.legacy_bo_missions(id) on delete cascade,
  identificateur_id text not null references public.legacy_bo_identificateurs(id) on delete cascade,
  assigned_at       timestamptz not null default now(),
  primary key (mission_id, identificateur_id)
);

create index if not exists idx_legacy_bo_mission_assignees_identificateur
  on public.legacy_bo_mission_assignees(identificateur_id);

alter table public.legacy_bo_mission_assignees enable row level security;
