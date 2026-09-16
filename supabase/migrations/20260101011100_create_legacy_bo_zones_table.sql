-- Migration: table legacy_bo_zones (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_zones (
  id                    text primary key default gen_random_uuid()::text,
  name                  text not null unique,
  region                text not null,
  identificateur_count  integer not null default 0,
  actor_count           integer not null default 0,
  target                integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_zones_updated_at on public.legacy_bo_zones;
create trigger set_legacy_bo_zones_updated_at
  before update on public.legacy_bo_zones
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_zones enable row level security;
