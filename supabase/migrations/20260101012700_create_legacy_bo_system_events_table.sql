-- Migration: table legacy_bo_system_events (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_system_events (
  id         text primary key default gen_random_uuid()::text,
  level      text not null default 'INFO',
  source     text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_legacy_bo_system_events_level on public.legacy_bo_system_events(level);
create index if not exists idx_legacy_bo_system_events_created on public.legacy_bo_system_events(created_at);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_system_events enable row level security;
