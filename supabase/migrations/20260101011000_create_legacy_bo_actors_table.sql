-- Migration: table legacy_bo_actors (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_actors (
  id                  text primary key default gen_random_uuid()::text,
  actor_id            text not null unique,
  first_name          text not null,
  last_name           text,
  type                text not null default 'marchand',
  phone               text not null,
  zone                text not null,
  status              text not null default 'actif',
  photo_url           text,
  gps_lat             real,
  gps_lng             real,
  identificateur_name text,
  identificateur_id   text,
  validated_by        text,
  validated_at        timestamptz,
  notes               text,
  merchant_id         text unique,
  producteur_id       text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_legacy_bo_actors_zone on public.legacy_bo_actors(zone);
create index if not exists idx_legacy_bo_actors_status on public.legacy_bo_actors(status);
create index if not exists idx_legacy_bo_actors_type on public.legacy_bo_actors(type);
create index if not exists idx_legacy_bo_actors_identificateur_id on public.legacy_bo_actors(identificateur_id);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_actors disable row level security;

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_actors_updated_at on public.legacy_bo_actors;
create trigger set_legacy_bo_actors_updated_at
  before update on public.legacy_bo_actors
  for each row execute function public.set_updated_at_legacy();
