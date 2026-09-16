-- Migration: table device_sessions (auth legacy)
-- Extrait de 004500_legacy_auth_tables.sql (re-baseline 1 table = 1 fichier).

create table if not exists public.device_sessions (
  id          text primary key default gen_random_uuid()::text,
  subject     text not null unique,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists idx_device_sessions_expires_at on public.device_sessions(expires_at);

-- RLS désactivée : tables legacy accédées uniquement côté serveur
-- (admin client / device session), l'auth applicative est gérée par l'app.
alter table public.device_sessions disable row level security;
