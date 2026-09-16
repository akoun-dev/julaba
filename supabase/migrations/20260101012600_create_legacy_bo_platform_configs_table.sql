-- Migration: table legacy_bo_platform_configs (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_platform_configs (
  id         text primary key default gen_random_uuid()::text,
  category   text not null unique,
  config     text not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_platform_configs_updated_at on public.legacy_bo_platform_configs;
create trigger set_legacy_bo_platform_configs_updated_at
  before update on public.legacy_bo_platform_configs
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_platform_configs enable row level security;
