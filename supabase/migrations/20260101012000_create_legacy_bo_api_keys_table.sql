-- Migration: table legacy_bo_api_keys (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_api_keys (
  id            text primary key default gen_random_uuid()::text,
  name          text not null,
  description   text,
  key           text not null unique,
  secret_hash   text not null,
  permissions   text not null default 'read',
  request_count integer not null default 0,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  is_active     boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_legacy_bo_api_keys_is_active on public.legacy_bo_api_keys(is_active);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.

-- updated_at automatique (fonction partagée set_updated_at_legacy)
drop trigger if exists set_legacy_bo_api_keys_updated_at on public.legacy_bo_api_keys;
create trigger set_legacy_bo_api_keys_updated_at
  before update on public.legacy_bo_api_keys
  for each row execute function public.set_updated_at_legacy();
alter table public.legacy_bo_api_keys enable row level security;
