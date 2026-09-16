-- Migration: table legacy_bo_identificateurs — annuaire des agents de terrain
-- Les comptes identificateur s'authentifient uniquement sur l'appareil (PIN
-- local) sans provisionnement backoffice : la table est remplie par ajout
-- direct (admin) ou upsert automatique à la première soumission de dossier.
-- (scission de 20260908004500_mission_teams_assignments.sql, 1 table = 1 fichier.)

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

alter table public.legacy_bo_identificateurs disable row level security;

drop trigger if exists set_legacy_bo_identificateurs_updated_at on public.legacy_bo_identificateurs;
create trigger set_legacy_bo_identificateurs_updated_at
before update on public.legacy_bo_identificateurs
for each row execute function public.set_updated_at_legacy();

-- Backfill : pré-remplir l'annuaire depuis les dossiers déjà soumis, pour
-- que « Créer mission » ne parte jamais d'une liste vide.
-- Backfill the roster from every identificateur who has already submitted
-- a dossier, so it isn't empty the first time someone opens "Créer mission".
insert into public.legacy_bo_identificateurs (id, name, zone)
select distinct on (e.identificateur_id)
  e.identificateur_id, e.identificateur_name, e.zone
from public.legacy_bo_enrolments e
where e.identificateur_id is not null and e.identificateur_id <> ''
order by e.identificateur_id, e.created_at desc
on conflict (id) do nothing;
