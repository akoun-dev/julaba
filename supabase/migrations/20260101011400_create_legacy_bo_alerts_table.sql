-- Migration: table legacy_bo_alerts (business legacy)
-- Extrait de 004600_legacy_business_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.legacy_bo_alerts (
  id            text primary key default gen_random_uuid()::text,
  severity      text not null default 'moyenne',
  title         text not null,
  message       text not null,
  module        text not null,
  acknowledged  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_legacy_bo_alerts_module on public.legacy_bo_alerts(module);
create index if not exists idx_legacy_bo_alerts_acknowledged on public.legacy_bo_alerts(acknowledged);

-- RLS désactivée : table legacy accédée uniquement côté serveur
-- (admin client / device session), cf. 004500_legacy_auth_tables.sql d'origine.
alter table public.legacy_bo_alerts enable row level security;
