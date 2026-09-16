-- Migration: table legacy_bo_missions (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_missions (
  id            text primary key default gen_random_uuid()::text,
  title         text not null,
  description   text,
  zone          text not null,
  assignee_id   text,
  assignee_name text,
  status        text not null default 'en_cours',
  target_count  integer not null default 0,
  current_count integer not null default 0,
  start_date    timestamptz not null,
  end_date      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_missions_zone on public.legacy_bo_missions(zone);
create index if not exists idx_legacy_bo_missions_status on public.legacy_bo_missions(status);
create index if not exists idx_legacy_bo_missions_assignee_id on public.legacy_bo_missions(assignee_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_missions disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_missions_updated_at on public.legacy_bo_missions;
create trigger set_legacy_bo_missions_updated_at
  before update on public.legacy_bo_missions
  for each row execute function public.set_updated_at_legacy();
