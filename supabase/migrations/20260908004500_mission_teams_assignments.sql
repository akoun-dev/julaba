-- ============================================================
-- Field-agent teams, the identificateur roster, and mission assignments.
--
-- Missions previously carried a single free-text assignee_name and were
-- never actually linked to the identificateurs doing the work, so a
-- mission's "objective" progress had no real relationship to enrolments
-- submitted on the ground. This adds:
--   - legacy_bo_teams: named groups of field agents ("équipes").
--   - legacy_bo_identificateurs: the field-agent roster missions assign
--     against. identificateur accounts authenticate purely on-device
--     (local PIN, see device-session.ts) with no prior backoffice
--     provisioning, so this table is populated two ways: an admin adds an
--     entry directly, or one is upserted automatically (id = the
--     device-generated identificateur id) the first time that agent
--     submits a dossier — see POST /api/backoffice/enrolments — otherwise
--     the roster would stay empty forever and nobody could be assigned.
--   - legacy_bo_mission_assignees: which identificateurs a mission is
--     assigned to (many-to-many); legacy_bo_missions.team_id is an
--     optional "assign this whole team" shortcut recorded alongside it.
-- ============================================================

create table if not exists public.legacy_bo_teams (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  zone        text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_legacy_bo_teams_name on public.legacy_bo_teams(name);

create table if not exists public.legacy_bo_identificateurs (
  id          text primary key,
  name        text not null,
  phone       text,
  zone        text,
  team_id     text references public.legacy_bo_teams(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_legacy_bo_identificateurs_team on public.legacy_bo_identificateurs(team_id);
create index if not exists idx_legacy_bo_identificateurs_zone on public.legacy_bo_identificateurs(zone);

alter table public.legacy_bo_missions
  add column if not exists team_id text references public.legacy_bo_teams(id) on delete set null;

create table if not exists public.legacy_bo_mission_assignees (
  mission_id        text not null references public.legacy_bo_missions(id) on delete cascade,
  identificateur_id text not null references public.legacy_bo_identificateurs(id) on delete cascade,
  assigned_at       timestamptz not null default now(),
  primary key (mission_id, identificateur_id)
);

create index if not exists idx_legacy_bo_mission_assignees_identificateur
  on public.legacy_bo_mission_assignees(identificateur_id);

alter table public.legacy_bo_teams disable row level security;
alter table public.legacy_bo_identificateurs disable row level security;
alter table public.legacy_bo_mission_assignees disable row level security;

create trigger set_legacy_bo_teams_updated_at
before update on public.legacy_bo_teams
for each row execute function public.set_updated_at_legacy();

create trigger set_legacy_bo_identificateurs_updated_at
before update on public.legacy_bo_identificateurs
for each row execute function public.set_updated_at_legacy();

-- Backfill the roster from every identificateur who has already submitted
-- a dossier, so it isn't empty the first time someone opens "Créer mission".
insert into public.legacy_bo_identificateurs (id, name, zone)
select distinct on (e.identificateur_id)
  e.identificateur_id, e.identificateur_name, e.zone
from public.legacy_bo_enrolments e
where e.identificateur_id is not null and e.identificateur_id <> ''
order by e.identificateur_id, e.created_at desc
on conflict (id) do nothing;
